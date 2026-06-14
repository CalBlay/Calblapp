import { after, type NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import {
  commitQuadrantConfirmedFirestoreBatch,
  deferQuadrantConfirmSideEffects,
  computeQuadrantProposalDiff,
  extractAssignedNamesFromQuadrant,
  quadrantConfirmTrim,
  type QuadrantConfirmDoc,
} from '@/lib/quadrantsConfirmDeferred'
import { autoAssign } from '@/services/autoAssign'
import { buildLedger } from '@/services/workloadLedger'
import { buildQuadrantSave } from '@/lib/quadrantsPost/buildQuadrantSave'
import {
  buildCuinaManualAssignmentOnly,
  type DepartmentPersonLite,
} from '@/lib/quadrantsPost/manualAssignments'
import { enrichWithSurveyPreferences } from '@/lib/quadrantsPost/surveyPreferences'
import { isQuadrantCoreDepartment, normalizeEventId } from '@/lib/quadrantsPost/utils'
import type { QuadrantSave, QuadrantSaveRequestBody, SingleFlowAssignResult } from '@/lib/quadrantsPost/types'

export type SingleFlowSaveParams = {
  req: NextRequest
  deptNorm: string
  mode: 'auto' | 'semi' | 'manual'
  body: Record<string, unknown>
  assignBody: Record<string, unknown>
  canonicalEventId: string
  collectionName: string
  confirmImmediatelyRequested: boolean
  jwtSessionForInlineConfirm: { user?: { email?: string }; email?: string } | null
  learningStatus: import('@/lib/quadrantLearning').QuadrantLearningSuggestion | null
  getDepartmentPeople: () => Promise<Awaited<ReturnType<typeof import('@/services/premises').loadDepartmentPersonnel>>>
  getPremisesData: () => Promise<Awaited<ReturnType<typeof import('@/services/premises').loadPremises>>>
  getSurveyPreferred: (serviceDate: string) => Promise<{ yes: string[]; maybe: string[] }>
  getLedgerForDate: (serviceDate: string) => Promise<Awaited<ReturnType<typeof buildLedger>>>
  applyStageData: (toSave: QuadrantSave) => Promise<void>
  ensureNoOverlapForQuadrantSave: (doc: QuadrantSave, excludeDocIds?: string[]) => Promise<void>
  getStageVerdCached: (stageDocId: string) => Promise<Record<string, unknown> | null>
  createdDocIds: string[]
}

export async function singleFlowSave(params: SingleFlowSaveParams) {
  const {
    req,
    deptNorm,
    mode,
    body,
    assignBody,
    canonicalEventId,
    collectionName,
    confirmImmediatelyRequested,
    jwtSessionForInlineConfirm,
    learningStatus,
    getDepartmentPeople,
    getPremisesData,
    getSurveyPreferred,
    getLedgerForDate,
    applyStageData,
    ensureNoOverlapForQuadrantSave,
    getStageVerdCached,
    createdDocIds,
  } = params

  const cuinaManualFast =
    mode === 'manual' &&
    deptNorm === 'cuina' &&
    Array.isArray(assignBody.groups) &&
    assignBody.groups.length > 0

  let finalAssignBody: QuadrantSaveRequestBody
  let res: SingleFlowAssignResult

  if (cuinaManualFast) {
    finalAssignBody = assignBody as QuadrantSaveRequestBody
    const departmentPeopleCu = await getDepartmentPeople()
    res = buildCuinaManualAssignmentOnly(
      assignBody as unknown as Record<string, unknown>,
      departmentPeopleCu as DepartmentPersonLite[]
    )
  } else {
    const finalSurveyPreferred = await getSurveyPreferred(
      String(assignBody.phaseDate || assignBody.startDate || '').slice(0, 10)
    )
    finalAssignBody = await enrichWithSurveyPreferences(assignBody, deptNorm, finalSurveyPreferred)
    const departmentPeople = await getDepartmentPeople()
    const premisesData = await getPremisesData()
    const ledger = await getLedgerForDate(
      String(assignBody.phaseDate || assignBody.startDate || '').slice(0, 10)
    )
    const normEvIdForBusy =
      typeof finalAssignBody.eventId === 'string' && String(finalAssignBody.eventId).trim()
        ? normalizeEventId(String(finalAssignBody.eventId))
        : canonicalEventId
    const singleFlowPhaseDateForBusy = String(
      finalAssignBody.phaseDate || body.phaseDate || finalAssignBody.startDate || ''
    ).trim()
    const shouldIgnoreSelfSingleFlow =
      String(body.generationScope || '').trim().toLowerCase() === 'event' &&
      Boolean(singleFlowPhaseDateForBusy)
    const singleFlowDocIdForBusy = shouldIgnoreSelfSingleFlow
      ? `${normEvIdForBusy}__event__${singleFlowPhaseDateForBusy}__event`
      : normEvIdForBusy
    const manualAssignment = body?.manualAssignment as
      | { responsibleName?: string | null; driverNames?: string[]; staffNames?: string[] }
      | undefined

    res =
      mode === 'manual'
        ? {
            assignment: {
              responsible: manualAssignment?.responsibleName
                ? { name: String(manualAssignment.responsibleName) }
                : null,
              drivers: Array.isArray(manualAssignment?.driverNames)
                ? manualAssignment.driverNames
                    .map((name) => ({ name: String(name || '').trim() }))
                    .filter((d) => d.name)
                : [],
              staff: Array.isArray(manualAssignment?.staffNames)
                ? manualAssignment.staffNames
                    .map((name) => ({ name: String(name || '').trim() }))
                    .filter((s) => s.name)
                : [],
            },
            meta: { needsReview: false, violations: [] as string[], notes: [] as string[] },
          }
        : ((await autoAssign({
            ...(finalAssignBody as unknown as Parameters<typeof autoAssign>[0]),
            departmentPeople,
            premises: premisesData?.premises,
            premisesWarnings: premisesData?.warnings || [],
            ledger,
            ignoreBusyQuadrantDocIds: [singleFlowDocIdForBusy],
          })) as SingleFlowAssignResult)
  }

  const { toSave } = buildQuadrantSave(deptNorm, mode, finalAssignBody, res.assignment, res.meta)
  await applyStageData(toSave)

  const normalizedEventId =
    typeof toSave.eventId === 'string' && toSave.eventId.trim()
      ? normalizeEventId(toSave.eventId)
      : canonicalEventId
  const singleFlowPhaseDate = String(body.phaseDate || toSave.phaseDate || toSave.startDate || '').trim()
  const shouldPersistSingleFlowPerDay =
    String(body.generationScope || '').trim().toLowerCase() === 'event' &&
    Boolean(singleFlowPhaseDate)
  const docIdForSingleFlow = shouldPersistSingleFlowPerDay
    ? `${normalizedEventId}__event__${singleFlowPhaseDate}__event`
    : normalizedEventId

  await ensureNoOverlapForQuadrantSave(toSave, [docIdForSingleFlow])
  await db.collection(collectionName).doc(docIdForSingleFlow).set(toSave, { merge: true })
  createdDocIds.push(docIdForSingleFlow)

  let confirmInlineApplied = false

  if (
    confirmImmediatelyRequested &&
    mode === 'manual' &&
    isQuadrantCoreDepartment(deptNorm) &&
    createdDocIds.length > 0
  ) {
    if (!jwtSessionForInlineConfirm) {
      return {
        errorResponse: {
          success: false,
          error: 'Sessió caducada mentre es desava',
          status: 401,
        },
      }
    }
    const uniqSf = Array.from(new Set(createdDocIds))
    const stagePayloadSf = await getStageVerdCached(canonicalEventId)
    const firstPrevSf = toSave as unknown as QuadrantConfirmDoc
    const confirmedAtSf = Timestamp.fromDate(new Date())
    const confirmedBySf =
      jwtSessionForInlineConfirm.user?.email || jwtSessionForInlineConfirm.email || 'system'
    await commitQuadrantConfirmedFirestoreBatch({
      colName: collectionName,
      docIds: uniqSf,
      confirmPatch: {
        status: 'confirmed',
        confirmedAt: confirmedAtSf,
        confirmedBy: confirmedBySf,
        code: quadrantConfirmTrim(stagePayloadSf?.code ?? stagePayloadSf?.C_digo ?? ''),
      },
    })
    const assignedSf = extractAssignedNamesFromQuadrant(firstPrevSf)
    const diffSf = computeQuadrantProposalDiff({
      proposal: firstPrevSf?.autoProposal || null,
      finalAssigned: assignedSf,
    })
    after(async () => {
      await deferQuadrantConfirmSideEffects({
        requestOrigin: req.nextUrl.origin,
        dept: deptNorm,
        colName: collectionName,
        eventId: String(canonicalEventId),
        confirmedAtIso: confirmedAtSf.toDate().toISOString(),
        confirmedBy: confirmedBySf,
        firstPrev: firstPrevSf,
        stageData: stagePayloadSf,
        assigned: assignedSf,
        diff: diffSf,
      })
    })
    confirmInlineApplied = true
  }

  after(() => {
    try {
      revalidateQuadrantsListCache()
    } catch {
      /* ignore */
    }
  })

  return {
    success: true,
    docIds: Array.from(new Set(createdDocIds)),
    confirmInlineApplied,
    proposal: {
      responsible: res.assignment.responsible,
      drivers: res.assignment.drivers,
      staff: res.assignment.staff,
    },
    meta: res.meta,
    learningStatus,
  }
}
