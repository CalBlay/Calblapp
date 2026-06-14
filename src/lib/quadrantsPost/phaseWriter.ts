import { after, type NextRequest } from 'next/server'
import { Timestamp, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore'
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
  applyManualServeisStaffPolicy,
  buildLogisticaManualAssignmentOnly,
  buildServeisManualAssignmentOnly,
  type DepartmentPersonLite,
} from '@/lib/quadrantsPost/manualAssignments'
import { enrichWithSurveyPreferences } from '@/lib/quadrantsPost/surveyPreferences'
import {
  norm,
  normalizeJamoneroAssignment,
  partitionAssignmentsAcrossPhases,
  isQuadrantCoreDepartment,
} from '@/lib/quadrantsPost/utils'
import type {
  JamoneroAssignmentNormalized,
  JamoneroAssignmentRaw,
  PhaseRequest,
  PreferredPhaseResult,
  QuadrantSave,
  QuadrantSaveRequestBody,
  ServeisGroupInput,
} from '@/lib/quadrantsPost/types'

export type WritePhaseDocDeps = {
  deptNorm: string
  mode: 'auto' | 'semi' | 'manual'
  body: Record<string, unknown>
  canonicalEventId: string
  collectionName: string
  getDepartmentPeople: () => Promise<Awaited<ReturnType<typeof import('@/services/premises').loadDepartmentPersonnel>>>
  getPremisesData: () => Promise<Awaited<ReturnType<typeof import('@/services/premises').loadPremises>>>
  getSurveyPreferred: (serviceDate: string) => Promise<{ yes: string[]; maybe: string[] }>
  getLedgerForDate: (serviceDate: string) => Promise<Awaited<ReturnType<typeof buildLedger>>>
  applyStageData: (toSave: QuadrantSave) => Promise<void>
  ensureNoOverlapForQuadrantSave: (doc: QuadrantSave, excludeDocIds?: string[]) => Promise<void>
  remainingServiceJamoneroAssignments: { current: JamoneroAssignmentNormalized[] }
  remainingServiceEventGroups: { current: number }
  createdDocIds: string[]
  savedDraftSnapshotByDocId: Map<string, QuadrantSave>
}

export function createWritePhaseDoc(deps: WritePhaseDocDeps) {
  const {
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
    remainingServiceJamoneroAssignments,
    remainingServiceEventGroups,
    createdDocIds,
    savedDraftSnapshotByDocId,
  } = deps

  const normalizePerson = (value?: string | null) =>
    (value || '').toString().trim().toLowerCase()

  const consumeServiceJamoneros = (
    assignment: {
      responsible?: { name: string } | null
      drivers?: Array<{ name?: string; isJamonero?: boolean }>
      staff?: Array<{ name?: string; isJamonero?: boolean }>
    }
  ) => {
    if (!remainingServiceJamoneroAssignments.current.length) return

    const usedNames = [
      ...(assignment.drivers || [])
        .filter((person) => person?.isJamonero === true && person.name && person.name !== assignment.responsible?.name)
        .map((person) => String(person.name)),
      ...(assignment.staff || [])
        .filter((person) => person?.isJamonero === true && person.name)
        .map((person) => String(person.name)),
    ]

    if (!usedNames.length) return

    const normalizedUsed = usedNames.map((name) => normalizePerson(name))
    const matchedManualIds = new Set<string>()
    normalizedUsed.forEach((usedName) => {
      const manual = remainingServiceJamoneroAssignments.current.find(
        (assignment) =>
          assignment.mode === 'manual' &&
          assignment.personnelName &&
          normalizePerson(assignment.personnelName) === usedName
      )
      if (manual) matchedManualIds.add(manual.id)
    })

    let remainingAutoToConsume = Math.max(normalizedUsed.length - matchedManualIds.size, 0)
    remainingServiceJamoneroAssignments.current = remainingServiceJamoneroAssignments.current.filter((assignment) => {
      if (matchedManualIds.has(assignment.id)) return false
      if (assignment.mode === 'auto' && remainingAutoToConsume > 0) {
        remainingAutoToConsume -= 1
        return false
      }
      return true
    })
  }

  return async (
    phase: PhaseRequest,
    blockedNames: string[] = [],
    phaseFirestoreQueue?: Array<{ docId: string; toSave: QuadrantSave }>
  ) => {
    const isPrimaryResponsibleEventGroup =
      deptNorm === 'serveis' &&
      phase.phaseType === 'event' &&
      Boolean(body.manualResponsibleId) &&
      String(phase.groupId || phase.groupsOverride?.[0]?.id || '') ===
        String((body.groups as ServeisGroupInput[] | undefined)?.[0]?.id || '')
    const phaseServiceJamoneros =
      deptNorm === 'serveis' && phase.phaseType === 'event'
        ? Array.isArray(phase.serviceJamoneroAssignmentsOverride)
          ? phase.serviceJamoneroAssignmentsOverride
          : Array.isArray(phase.partitionedServiceJamoneros)
            ? phase.partitionedServiceJamoneros
            : remainingServiceJamoneroAssignments.current.slice(
                0,
                Math.max(
                  remainingServiceJamoneroAssignments.current.length -
                    Math.max(remainingServiceEventGroups.current - 1, 0),
                  remainingServiceJamoneroAssignments.current.length > 0 ? 1 : 0
                )
              )
        : []
    const phaseNumDrivers =
      deptNorm === 'serveis' && phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
        ? Math.max(Number(phase.numDrivers || 0), 1)
        : Number(phase.numDrivers || 0)
    const phaseGroupsOverride =
      deptNorm === 'serveis' && Array.isArray(phase.groupsOverride)
        ? phase.groupsOverride.map((group) => ({
            ...group,
            drivers:
              phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
                ? Math.max(Number(group.drivers || 0), 1)
                : Number(group.drivers || 0),
            needsDriver:
              phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
                ? true
                : !!group.needsDriver,
          }))
        : phase.groupsOverride
    const phaseTimetables = Array.isArray(phase.timetables)
      ? phase.timetables
      : body.timetables
    const phaseBody = {
      ...body,
      startDate: phase.date || body.startDate,
      endDate: phase.endDate || phase.date || body.endDate,
      startTime: phase.startTime || body.startTime,
      endTime: phase.endTime || body.endTime,
      meetingPoint: phase.meetingPoint || body.meetingPoint || '',
      totalWorkers: Number(phase.totalWorkers || 0),
      jamoneroCount:
        deptNorm === 'serveis' && phase.phaseType === 'event'
          ? phaseServiceJamoneros.length
          : Number(phase.jamoneroCount || 0),
      numDrivers: phaseNumDrivers,
      manualResponsibleId: isPrimaryResponsibleEventGroup
        ? body.manualResponsibleId
        : phase.wantsResp
        ? phase.responsableId || null
        : null,
      manualDriverId: phase.manualDriverId || null,
      skipResponsible: isPrimaryResponsibleEventGroup ? false : phase.wantsResp === false,
      vehicles: Array.isArray(phase.vehicles) ? phase.vehicles : [],
      blockedNames,
      groups: phaseGroupsOverride || body.groups,
      phaseType: phase.phaseType || null,
      phaseLabel: phase.label || null,
      phaseDate: phase.date || null,
      timetables: phaseTimetables,
      serviceJamoneroAssignments: phaseServiceJamoneros,
      manualWorkers:
        Array.isArray((phase as { manualWorkers?: unknown[] }).manualWorkers) &&
        ((phase as { manualWorkers: unknown[] }).manualWorkers ?? []).length > 0
          ? (phase as { manualWorkers: unknown[] }).manualWorkers
          : undefined,
    }
    /** Manual Serveis / Logística: sense autoAssign, ledger ni enriquiments de quota per fase. */
    const phaseManualServeis = mode === 'manual' && deptNorm === 'serveis'
    const phaseManualLogistica = mode === 'manual' && deptNorm === 'logistica'
    const phaseSkipHeavyPipeline = phaseManualServeis || phaseManualLogistica

    let phaseAssignBody: Record<string, unknown>
    if (phaseSkipHeavyPipeline) {
      phaseAssignBody = {
        ...phaseBody,
        preferredStaffNames: Array.isArray(phaseBody.preferredStaffNames)
          ? (phaseBody.preferredStaffNames as string[])
          : [],
        preferredDriverNames: Array.isArray(phaseBody.preferredDriverNames)
          ? (phaseBody.preferredDriverNames as string[])
          : [],
        preferredResponsibleName:
          typeof phaseBody.preferredResponsibleName === 'string'
            ? phaseBody.preferredResponsibleName
            : null,
      }
    } else {
      const phaseSurveyPreferred = await getSurveyPreferred(
        String(phase.date || body.startDate || '').slice(0, 10)
      )
      phaseAssignBody = (await enrichWithSurveyPreferences(
        phaseBody,
        deptNorm,
        phaseSurveyPreferred
      )) as Record<string, unknown>
    }
    const departmentPeople = await getDepartmentPeople()
    const groupsForManual = Array.isArray(phaseAssignBody.groups)
      ? (phaseAssignBody.groups as ServeisGroupInput[])
      : []

    type PhaseAssignResult = {
      assignment: {
        responsible?: { name: string } | null
        drivers?: Array<{
          name: string
          meetingPoint?: string
          plate?: string
          vehicleType?: string
          isJamonero?: boolean
        }>
        staff?: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
      }
      meta: {
        needsReview?: boolean
        violations?: string[]
        notes?: string[]
      }
    }

    let res: PhaseAssignResult
    if (phaseManualServeis) {
      const built = buildServeisManualAssignmentOnly(
        phaseAssignBody,
        departmentPeople as DepartmentPersonLite[],
        phaseServiceJamoneros
      )
      res = built
    } else if (phaseManualLogistica) {
      const built = buildLogisticaManualAssignmentOnly(
        phaseAssignBody,
        departmentPeople as DepartmentPersonLite[]
      )
      res = built
    } else {
      const premisesData = await getPremisesData()
      const ledger = await getLedgerForDate(String(phase.date || body.startDate || '').slice(0, 10))
      const phaseKeyForBusy = norm(phase.label || phase.phaseType || 'fase')
      const phaseDateForBusy = String(phase.date || body.startDate)
      const groupKeyForBusy = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
      const phaseDocIdForBusy = `${canonicalEventId}__${phaseKeyForBusy}__${phaseDateForBusy}__${
        groupKeyForBusy || 'group'
      }`
      type AutoAssignPayload = Parameters<typeof autoAssign>[0]
      res = (await autoAssign({
        ...(phaseAssignBody as unknown as AutoAssignPayload),
        departmentPeople,
        premises: premisesData?.premises,
        premisesWarnings: premisesData?.warnings || [],
        ledger,
        ignoreBusyQuadrantDocIds: [phaseDocIdForBusy],
      })) as PhaseAssignResult
    }

    if (mode === 'manual' && deptNorm === 'serveis' && !phaseManualServeis) {
      const meetingForStaff = String(phaseAssignBody.meetingPoint || body.meetingPoint || '')
      res = {
        ...res,
        assignment: applyManualServeisStaffPolicy(
          res.assignment,
          groupsForManual,
          departmentPeople as DepartmentPersonLite[],
          phaseServiceJamoneros,
          meetingForStaff
        ),
      }
    }
    if (deptNorm === 'serveis' && phase.phaseType === 'event') {
      consumeServiceJamoneros(res.assignment)
      remainingServiceEventGroups.current = Math.max(remainingServiceEventGroups.current - 1, 0)
    }
    const { toSave } = buildQuadrantSave(
      deptNorm,
      mode,
      phaseAssignBody as unknown as QuadrantSaveRequestBody,
      res.assignment,
      res.meta
    )
    await applyStageData(toSave)
    const phaseKey = norm(phase.label || phase.phaseType || 'fase')
    const phaseDate = String(phase.date || body.startDate)
    const groupKey = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
    const docId = `${canonicalEventId}__${phaseKey}__${phaseDate}__${groupKey || 'group'}`
    await ensureNoOverlapForQuadrantSave(toSave, [docId])
    savedDraftSnapshotByDocId.set(docId, toSave)
    if (phaseFirestoreQueue && phaseSkipHeavyPipeline) {
      phaseFirestoreQueue.push({ docId, toSave })
    } else {
      await db.collection(collectionName).doc(docId).set(toSave, { merge: true })
    }
    createdDocIds.push(docId)
    return res
  }
}

export type ProcessPhaseRequestsParams = {
  req: NextRequest
  deptNorm: string
  mode: 'auto' | 'semi' | 'manual'
  body: Record<string, unknown>
  canonicalEventId: string
  collectionName: string
  phaseRequests: PhaseRequest[]
  jamAssignmentsAllowServeisFirestoreBatch: boolean
  confirmImmediatelyRequested: boolean
  jwtSessionForInlineConfirm: { user?: { email?: string }; email?: string } | null
  learningStatus: import('@/lib/quadrantLearning').QuadrantLearningSuggestion | null
  getStageVerdCached: (stageDocId: string) => Promise<Record<string, unknown> | null>
  getDepartmentPeople: () => Promise<unknown>
  writePhaseDoc: ReturnType<typeof createWritePhaseDoc>
  createdDocIds: string[]
  savedDraftSnapshotByDocId: Map<string, QuadrantSave>
}

export async function processPhaseRequests(params: ProcessPhaseRequestsParams) {
  const {
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
  } = params

  const emptyPreferredResult: PreferredPhaseResult = {
    assignment: {
      responsible: null,
      drivers: [],
      staff: [],
    },
    meta: {
      needsReview: false,
      violations: [],
      notes: [],
    },
  }

  const blockedNamesInBatch = new Set<string>()
  let preferredResult = emptyPreferredResult
  let hasPreferredResult = false
  const orderedPhaseRequests =
    deptNorm === 'serveis'
      ? [
          ...phaseRequests
            .filter((phase) => phase.phaseType === 'event')
            .sort((a, b) => {
              const aIsResponsibleGroup =
                Boolean(String(a.responsableId || '').trim()) ||
                (Boolean(body.manualResponsibleId) &&
                  String(a.groupId || a.groupsOverride?.[0]?.id || '') ===
                    String((body.groups as ServeisGroupInput[] | undefined)?.[0]?.id || ''))
              const bIsResponsibleGroup =
                Boolean(String(b.responsableId || '').trim()) ||
                (Boolean(body.manualResponsibleId) &&
                  String(b.groupId || b.groupsOverride?.[0]?.id || '') ===
                    String((body.groups as ServeisGroupInput[] | undefined)?.[0]?.id || ''))
              if (aIsResponsibleGroup !== bIsResponsibleGroup) return aIsResponsibleGroup ? -1 : 1

              const aHasManualDriver = Boolean(String(a.manualDriverId || '').trim())
              const bHasManualDriver = Boolean(String(b.manualDriverId || '').trim())
              if (aHasManualDriver !== bHasManualDriver) return aHasManualDriver ? -1 : 1
              return 0
            }),
          ...phaseRequests.filter((phase) => phase.phaseType !== 'event'),
        ]
      : deptNorm === 'logistica'
      ? [
          ...phaseRequests.filter((phase) => phase.phaseType === 'event'),
          ...phaseRequests.filter((phase) => phase.phaseType !== 'event'),
        ]
      : phaseRequests

  if (deptNorm === 'serveis' && orderedPhaseRequests.length > 0) {
    const serveisEventPhasesInOrder = orderedPhaseRequests.filter((p) => p.phaseType === 'event')
    if (
      serveisEventPhasesInOrder.length > 0 &&
      Array.isArray(body.serviceJamoneroAssignments) &&
      body.serviceJamoneroAssignments.length > 0
    ) {
      const normalizedServeisJamoneros = (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(
        normalizeJamoneroAssignment
      )
      const jamoneroChunks = partitionAssignmentsAcrossPhases(
        normalizedServeisJamoneros,
        serveisEventPhasesInOrder.length
      )
      serveisEventPhasesInOrder.forEach((phase, idx) => {
        phase.partitionedServiceJamoneros = jamoneroChunks[idx] || []
      })
    }
  }

  const manualPhasesFirestoreQueue =
    mode === 'manual' &&
    (deptNorm === 'logistica' ||
      (deptNorm === 'serveis' && jamAssignmentsAllowServeisFirestoreBatch))
      ? ([] as Array<{ docId: string; toSave: QuadrantSave }>)
      : undefined

  if (mode === 'manual' && (deptNorm === 'serveis' || deptNorm === 'logistica')) {
    /** Personal + stage_verd en paral·lel: warmup abans del bucle de fases (menys espera seqüencial). */
    await Promise.all([getDepartmentPeople(), getStageVerdCached(canonicalEventId)])
  }

  const manualPhasesParallel =
    mode === 'manual' &&
    Boolean(manualPhasesFirestoreQueue) &&
    (deptNorm === 'logistica' || deptNorm === 'serveis')

  const applyPhaseWriteResult = (phase: PhaseRequest, result: Awaited<ReturnType<ReturnType<typeof createWritePhaseDoc>>>) => {
    const normalizedResult: PreferredPhaseResult = {
      assignment: {
        responsible: result.assignment?.responsible || null,
        drivers: Array.isArray(result.assignment?.drivers)
          ? result.assignment.drivers.map((driver) => ({
              name: driver.name,
              meetingPoint: driver.meetingPoint,
              plate: driver.plate,
              vehicleType: driver.vehicleType,
            }))
          : [],
        staff: Array.isArray(result.assignment?.staff)
          ? result.assignment.staff.map((person) => ({
              name: person.name,
              meetingPoint: person.meetingPoint,
            }))
          : [],
      },
      meta: {
        needsReview: Boolean(result.meta?.needsReview),
        violations: Array.isArray(result.meta?.violations) ? result.meta.violations : [],
        notes: Array.isArray(result.meta?.notes) ? result.meta.notes : [],
      },
    }
    if (!hasPreferredResult && phase.phaseType === 'event') {
      preferredResult = normalizedResult
      hasPreferredResult = true
    }
    if (!hasPreferredResult) {
      preferredResult = normalizedResult
      hasPreferredResult = true
    }
    const assignedNames = [
      result?.assignment?.responsible?.name || null,
      ...(Array.isArray(result?.assignment?.drivers)
        ? result.assignment.drivers.map((driver) => driver?.name || null)
        : []),
      ...(Array.isArray(result?.assignment?.staff)
        ? result.assignment.staff.map((person) => person?.name || null)
        : []),
    ]
    assignedNames
      .filter((name): name is string => Boolean(name) && String(name).trim() !== '' && String(name) !== 'Extra')
      .forEach((name) => blockedNamesInBatch.add(String(name)))
  }

  if (manualPhasesParallel) {
    /** Manual Serveis / Logística: build sense `blockedNames`; escriure les fases en paral·lel. */
    const tuples = await Promise.all(
      orderedPhaseRequests.map((phase, index) =>
        writePhaseDoc(phase, [], manualPhasesFirestoreQueue).then((result) => ({
          index,
          phase,
          result,
        }))
      )
    )
    tuples.sort((a, b) => a.index - b.index)
    tuples.forEach(({ phase, result }) => applyPhaseWriteResult(phase, result))
  } else {
    for (const phase of orderedPhaseRequests) {
      const result = await writePhaseDoc(
        phase,
        Array.from(blockedNamesInBatch),
        manualPhasesFirestoreQueue
      )
      applyPhaseWriteResult(phase, result)
    }
  }

  if (manualPhasesFirestoreQueue && manualPhasesFirestoreQueue.length > 0) {
    let fwBatch = db.batch()
    let fwCount = 0
    const fwCol = db.collection(collectionName)
    const flushFw = async () => {
      if (fwCount === 0) return
      await fwBatch.commit()
      fwBatch = db.batch()
      fwCount = 0
    }
    for (const row of manualPhasesFirestoreQueue) {
      fwBatch.set(fwCol.doc(row.docId), row.toSave as DocumentData, { merge: true })
      fwCount++
      if (fwCount >= 480) await flushFw()
    }
    await flushFw()
  }

  let confirmInlineApplied = false

  if (
    confirmImmediatelyRequested &&
    createdDocIds.length > 0 &&
    mode === 'manual' &&
    isQuadrantCoreDepartment(deptNorm)
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
    const uniqIds = Array.from(new Set(createdDocIds))
    const firstDocId = uniqIds[0]
    const firstDraftRef = db.collection(collectionName).doc(firstDocId)
    const reuseDraftSnapshot = savedDraftSnapshotByDocId.has(firstDocId)
    const [stagePayload, fetchedSnapMaybe] = await Promise.all([
      getStageVerdCached(canonicalEventId),
      reuseDraftSnapshot
        ? Promise.resolve<DocumentSnapshot | undefined>(undefined)
        : firstDraftRef.get(),
    ])
    const firstPrevInline: QuadrantConfirmDoc | null = reuseDraftSnapshot
      ? (savedDraftSnapshotByDocId.get(firstDocId)! as unknown as QuadrantConfirmDoc)
      : fetchedSnapMaybe?.exists
        ? (fetchedSnapMaybe.data() as QuadrantConfirmDoc)
        : null
    const sdInline = stagePayload
    const confirmedAtIc = Timestamp.fromDate(new Date())
    const confirmedByIc =
      jwtSessionForInlineConfirm.user?.email || jwtSessionForInlineConfirm.email || 'system'
    await commitQuadrantConfirmedFirestoreBatch({
      colName: collectionName,
      docIds: uniqIds,
      confirmPatch: {
        status: 'confirmed',
        confirmedAt: confirmedAtIc,
        confirmedBy: confirmedByIc,
        code: quadrantConfirmTrim(sdInline?.code ?? sdInline?.C_digo ?? ''),
      },
    })
    const assignedIc = extractAssignedNamesFromQuadrant(firstPrevInline)
    const diffIc = computeQuadrantProposalDiff({
      proposal: firstPrevInline?.autoProposal || null,
      finalAssigned: assignedIc,
    })
    after(async () => {
      await deferQuadrantConfirmSideEffects({
        requestOrigin: req.nextUrl.origin,
        dept: deptNorm,
        colName: collectionName,
        eventId: String(canonicalEventId),
        confirmedAtIso: confirmedAtIc.toDate().toISOString(),
        confirmedBy: confirmedByIc,
        firstPrev: firstPrevInline,
        stageData: sdInline,
        assigned: assignedIc,
        diff: diffIc,
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
      responsible: preferredResult.assignment.responsible,
      drivers: preferredResult.assignment.drivers,
      staff: preferredResult.assignment.staff,
    },
    meta: preferredResult.meta,
    learningStatus,
  }
}
