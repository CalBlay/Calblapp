import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { preloadQuadrantOverlapBusyDocs, type OverlapBusySnapshot } from '@/lib/quadrantOverlapGuard'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import {
  getQuadrantLearningSuggestion,
  type QuadrantLearningSuggestion,
} from '@/lib/quadrantLearning'
import { getSurveyPreferredCandidates } from '@/lib/quadrantSurveys'
import { loadDepartmentPersonnel, loadPremises } from '@/services/premises'
import { buildLedger } from '@/services/workloadLedger'
import { buildLogisticaPhaseRequests } from '@/lib/quadrantsPost/buildLogisticaPhaseRequests'
import { buildServeisPhaseRequests } from '@/lib/quadrantsPost/buildServeisPhaseRequests'
import { createOverlapGuard } from '@/lib/quadrantsPost/overlap'
import { createWritePhaseDoc, processPhaseRequests } from '@/lib/quadrantsPost/phaseWriter'
import { singleFlowSave } from '@/lib/quadrantsPost/singleFlowSave'
import { createStageDataApplier } from '@/lib/quadrantsPost/stageData'
import {
  getDateWindow,
  isQuadrantCoreDepartment,
  norm,
  normalizeEventId,
  normalizeJamoneroAssignment,
  resolveWriteCollectionForDepartment,
} from '@/lib/quadrantsPost/utils'
import type {
  JamoneroAssignmentNormalized,
  JamoneroAssignmentRaw,
  PhaseRequest,
  QuadrantSave,
} from '@/lib/quadrantsPost/types'

export async function handlePostQuadrant(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canView = await canViewUiPath({ user: auth.user, path: '/menu/quadrants' })
    if (!canView) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const canonicalEventId = normalizeEventId(String(body?.eventId || ''))
    let cachedDepartmentPeople: Awaited<ReturnType<typeof loadDepartmentPersonnel>> | null = null
    let cachedPremisesData: Awaited<ReturnType<typeof loadPremises>> | null = null
    const surveyPreferredCache = new Map<string, Awaited<ReturnType<typeof getSurveyPreferredCandidates>>>()
    const ledgerCache = new Map<string, Awaited<ReturnType<typeof buildLedger>>>()

    const stageVerdPayloadCache = new Map<string, Record<string, unknown> | null>()
    const getStageVerdCached = async (stageDocId: string): Promise<Record<string, unknown> | null> => {
      const id = String(stageDocId || '').trim()
      if (!id) return null
      if (stageVerdPayloadCache.has(id)) {
        return stageVerdPayloadCache.get(id) ?? null
      }
      const snap = await db.collection('stage_verd').doc(id).get()
      const payload = snap.exists ? ((snap.data() || {}) as Record<string, unknown>) : null
      stageVerdPayloadCache.set(id, payload)
      return payload
    }

    const required = ['eventId', 'department', 'startDate', 'endDate']
    for (const k of required) {
      if (!body?.[k]) {
        return NextResponse.json({ success: false, error: `Missing ${k}` }, { status: 400 })
      }
    }

    const deptNorm = norm(String(body.department || ''))
    const overlapStartBound = String(body.startDate || '').trim()
    const overlapEndBound = String(body.endDate || body.startDate || '').trim()
    let overlapWarmupPromise: Promise<OverlapBusySnapshot> | null =
      overlapStartBound && overlapEndBound
        ? preloadQuadrantOverlapBusyDocs(overlapStartBound, overlapEndBound).catch((err) => {
            console.warn('[quadrants/route] overlap warmup failed', err)
            return [] as OverlapBusySnapshot
          })
        : null

    const [collectionName, canSave] = await Promise.all([
      resolveWriteCollectionForDepartment(deptNorm),
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'save'),
      }),
    ])
    console.log('[quadrants/route] Escriurà a col·lecció:', collectionName)

    const mode: 'auto' | 'semi' | 'manual' =
      body?.mode === 'auto' || body?.mode === 'semi' || body?.mode === 'manual'
        ? body.mode
        : 'semi'

    const confirmImmediatelyRequested = Boolean(body?.confirmImmediately === true)
    let jwtSessionForInlineConfirm: { user?: { email?: string }; email?: string } | null = null

    if (canSave !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    if (confirmImmediatelyRequested) {
      const canConfirm = await isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'confirm'),
      })
      if (canConfirm !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    if (confirmImmediatelyRequested && (mode !== 'manual' || !isQuadrantCoreDepartment(deptNorm))) {
      return NextResponse.json(
        {
          success: false,
          error:
            'confirmImmediately només és vàlid en mode manual per a departaments Serveis, Cuina o Logística',
        },
        { status: 400 }
      )
    }
    if (confirmImmediatelyRequested && mode === 'manual' && isQuadrantCoreDepartment(deptNorm)) {
      jwtSessionForInlineConfirm = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as {
        user?: { email?: string }
        email?: string
      } | null
      if (!jwtSessionForInlineConfirm) {
        return NextResponse.json(
          { success: false, error: 'Cal sessió per confirmar en el mateix desament' },
          { status: 401 }
        )
      }
    }

    let learningStatus: QuadrantLearningSuggestion | null = null
    if (mode === 'auto' && isQuadrantCoreDepartment(deptNorm)) {
      try {
        learningStatus = await getQuadrantLearningSuggestion({
          department: deptNorm,
          eventId: canonicalEventId,
          ln: typeof body?.ln === 'string' ? body.ln : null,
          service: typeof body?.service === 'string' ? body.service : null,
          location: typeof body?.location === 'string' ? body.location : null,
          numPax:
            typeof body?.numPax === 'number'
              ? body.numPax
              : Number.isFinite(Number(body?.numPax))
                ? Number(body.numPax)
                : null,
          startDate: typeof body?.startDate === 'string' ? body.startDate : null,
          startTime: typeof body?.startTime === 'string' ? body.startTime : null,
          phaseType: typeof body?.phaseType === 'string' ? body.phaseType : null,
        })

        if (learningStatus.hasNameSuggestions) {
          if (!body.preferredResponsibleName && learningStatus.preferredNames.responsible) {
            body.preferredResponsibleName = learningStatus.preferredNames.responsible
          }
          if (
            (!Array.isArray(body.preferredDriverNames) || body.preferredDriverNames.length === 0) &&
            learningStatus.preferredNames.drivers.length > 0
          ) {
            body.preferredDriverNames = [...learningStatus.preferredNames.drivers]
          }
          if (
            (!Array.isArray(body.preferredStaffNames) || body.preferredStaffNames.length === 0) &&
            learningStatus.preferredNames.staff.length > 0
          ) {
            body.preferredStaffNames = [...learningStatus.preferredNames.staff]
          }
        }
      } catch (err) {
        console.warn('[quadrants/route] learning suggestion failed', err)
        learningStatus = null
      }
    }

    const getDepartmentPeople = async () => {
      if (!cachedDepartmentPeople) {
        cachedDepartmentPeople = await loadDepartmentPersonnel(deptNorm)
      }
      return cachedDepartmentPeople
    }

    const getPremisesData = async () => {
      if (!cachedPremisesData) {
        cachedPremisesData = await loadPremises(deptNorm, await getDepartmentPeople())
      }
      return cachedPremisesData
    }

    const getSurveyPreferred = async (serviceDate: string) => {
      const key = `${canonicalEventId}__${deptNorm}__${String(serviceDate || '').slice(0, 10)}`
      if (!surveyPreferredCache.has(key)) {
        surveyPreferredCache.set(
          key,
          await getSurveyPreferredCandidates({
            eventId: canonicalEventId,
            department: deptNorm,
            serviceDate: String(serviceDate || '').slice(0, 10),
          })
        )
      }
      return surveyPreferredCache.get(key) || { yes: [], maybe: [] }
    }

    const getLedgerForDate = async (serviceDate: string) => {
      const { ws, we, ms, me } = getDateWindow(serviceDate)
      const key = `${deptNorm}__${ws}__${we}__${ms}__${me}`
      if (!ledgerCache.has(key)) {
        ledgerCache.set(
          key,
          await buildLedger(deptNorm, ws, we, ms, me, {
            includeAllDepartmentsForBusy: true,
          })
        )
      }
      return ledgerCache.get(key) as Awaited<ReturnType<typeof buildLedger>>
    }

    const assignBody =
      deptNorm === 'serveis' &&
      Array.isArray(body.groups) &&
      body.groups.length > 0
        ? {
            ...body,
            startDate: body.groups[0]?.serviceDate || body.startDate,
            endDate: body.groups[0]?.serviceDate || body.endDate,
            startTime: body.groups[0]?.startTime || body.startTime,
            endTime: body.groups[0]?.endTime || body.endTime,
          }
        : body

    const logisticaPhasesIn = Array.isArray(body.logisticaPhases) ? body.logisticaPhases : []

    const applyStageData = createStageDataApplier(getStageVerdCached, body, canonicalEventId)
    const { ensureNoOverlapForQuadrantSave } = createOverlapGuard(
      overlapStartBound,
      overlapEndBound,
      overlapWarmupPromise
    )

    let phaseRequests: PhaseRequest[] = []
    const createdDocIds: string[] = []
    const savedDraftSnapshotByDocId = new Map<string, QuadrantSave>()
    let remainingServiceJamoneroAssignments: JamoneroAssignmentNormalized[] = Array.isArray(
      body.serviceJamoneroAssignments
    )
      ? (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(normalizeJamoneroAssignment)
      : []
    let remainingServiceEventGroups = 0

    const normalizedBodyJamForFirestoreBatch = Array.isArray(body.serviceJamoneroAssignments)
      ? (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(normalizeJamoneroAssignment)
      : []
    const jamAssignmentsAllowServeisFirestoreBatch =
      normalizedBodyJamForFirestoreBatch.length === 0 ||
      !normalizedBodyJamForFirestoreBatch.some((j) => j.mode === 'auto')

    if (deptNorm === 'logistica' && logisticaPhasesIn.length > 0) {
      phaseRequests = buildLogisticaPhaseRequests(logisticaPhasesIn, body)
    } else if (deptNorm === 'serveis' && Array.isArray(body.groups) && body.groups.length > 0) {
      const serveisResult = await buildServeisPhaseRequests({
        body,
        mode,
        getDepartmentPeople,
        getPremisesData,
      })
      phaseRequests = serveisResult.phaseRequests
      remainingServiceEventGroups = serveisResult.remainingServiceEventGroups
    }

    const writePhaseDoc = createWritePhaseDoc({
      deptNorm,
      mode,
      body,
      canonicalEventId,
      collectionName,
      getDepartmentPeople,
      getPremisesData,
      getSurveyPreferred,
      getLedgerForDate,
      applyStageData,
      ensureNoOverlapForQuadrantSave,
      remainingServiceJamoneroAssignments: { current: remainingServiceJamoneroAssignments },
      remainingServiceEventGroups: { current: remainingServiceEventGroups },
      createdDocIds,
      savedDraftSnapshotByDocId,
    })

    if (phaseRequests.length > 0) {
      const result = await processPhaseRequests({
        req,
        deptNorm,
        mode,
        body,
        canonicalEventId,
        collectionName,
        phaseRequests,
        jamAssignmentsAllowServeisFirestoreBatch,
        confirmImmediatelyRequested,
        jwtSessionForInlineConfirm,
        learningStatus,
        getStageVerdCached,
        getDepartmentPeople,
        writePhaseDoc,
        createdDocIds,
        savedDraftSnapshotByDocId,
      })
      if ('errorResponse' in result && result.errorResponse) {
        return NextResponse.json(result.errorResponse, { status: result.errorResponse.status })
      }
      return NextResponse.json(result)
    }

    const singleResult = await singleFlowSave({
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
    })
    if ('errorResponse' in singleResult && singleResult.errorResponse) {
      return NextResponse.json(singleResult.errorResponse, { status: singleResult.errorResponse.status })
    }
    return NextResponse.json(singleResult)
  } catch (e: unknown) {
    console.error('[quadrants/route] error:', e)
    if (e instanceof Error) {
      const status =
        typeof (e as Error & { status?: unknown }).status === 'number'
          ? Number((e as Error & { status?: number }).status)
          : 500
      return NextResponse.json(
        {
          success: false,
          error: e.message,
          conflicts:
            status === 409
              ? (e as Error & { conflicts?: unknown }).conflicts || []
              : [],
        },
        { status }
      )
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
