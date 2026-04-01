import {
  buildGroupedDraftPersistence,
  normalizeDepartmentKey,
  normalizeRowsForDepartmentSave,
  type EditorGroup,
  type EditorRole,
  type EditorRow,
} from '@/lib/quadrantsDraftEditor'

type FirestoreDb = typeof import('@/lib/firebaseAdmin').firestoreAdmin

type SaveDraftContext = {
  db: FirestoreDb
  coll: string
  department: string
  sourceDocId: string
  canonicalEventId: string
  rows: EditorRow[]
  groups?: EditorGroup[]
}

type SaveDraftResult = {
  updateData: Record<string, unknown>
  normalizedRows: EditorRow[]
}

type Line = {
  id: string
  name: string
  groupId?: string
  meetingPoint: string
  isJamonero?: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  arrivalTime: string
  vehicleType: string
  plate: string
}

const toLine = (p: EditorRow): Line => ({
  id: p?.id || '',
  name: p?.name || '',
  groupId: p?.groupId || '',
  meetingPoint: p?.meetingPoint || '',
  isJamonero: p?.isJamonero === true,
  startDate: p?.startDate || '',
  startTime: p?.startTime || '',
  endDate: p?.endDate || '',
  endTime: p?.endTime || '',
  arrivalTime: p?.arrivalTime || '',
  vehicleType: p?.vehicleType || '',
  plate: p?.plate || '',
})

const normalizePersonKey = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()

const uniquePeople = (rows: EditorRow[]) => {
  const seen = new Set<string>()
  const unique: EditorRow[] = []

  rows.forEach((row) => {
    const name = String(row?.name || '').trim()
    if (!name || name === 'Extra') return
    const key = normalizePersonKey(row.id || name)
    if (!key || seen.has(key)) return
    seen.add(key)
    unique.push(row)
  })

  return unique
}

const buildBaseUpdateData = ({
  department,
  canonicalEventId,
  rows,
}: {
  department: string
  canonicalEventId: string
  rows: EditorRow[]
}) => {
  const departmentKey = normalizeDepartmentKey(department)
  const isLogistica = departmentKey === 'logistica'
  const normalizedRows = normalizeRowsForDepartmentSave({ rows })
  const responsables = normalizedRows.filter((row) => row.role === 'responsable')
  const conductors = normalizedRows.filter((row) => row.role === 'conductor')
  const treballadors = normalizedRows.filter((row) => row.role === 'treballador')
  const normalizedTreballadors = isLogistica
    ? uniquePeople([...responsables, ...conductors, ...treballadors])
    : treballadors
  const mainResponsable = responsables[0] ?? null

  return {
    normalizedRows,
    updateData: {
      department: departmentKey,
      eventId: canonicalEventId,
      responsables: responsables.map(toLine),
      conductors: conductors.map(toLine),
      treballadors: normalizedTreballadors.map(toLine),
      numDrivers: conductors.length,
      totalWorkers: normalizedTreballadors.length,
      responsable: mainResponsable ? toLine(mainResponsable) : null,
      responsableId: mainResponsable?.id || '',
      responsableName: mainResponsable?.name || '',
      status: 'draft' as const,
      updatedAt: new Date(),
    } satisfies Record<string, unknown>,
  }
}

const persistServeisDraft = async ({
  db,
  coll,
  department,
  canonicalEventId,
  rows,
  groups,
}: SaveDraftContext) => {
  const departmentKey = normalizeDepartmentKey(department)
  const normalizedRows = normalizeRowsForDepartmentSave({ rows })
  const hasGroupedRows = normalizedRows.some((row) => row.groupId)

  if (!Array.isArray(groups) || groups.length === 0 || !hasGroupedRows) {
    return null
  }

  const eventDocsSnap = await db.collection(coll).where('eventId', '==', canonicalEventId).get()
  const existingDocs = eventDocsSnap.docs
  const baseDoc = existingDocs[0]?.data() || {}
  const existingByGroup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

  existingDocs.forEach((doc) => {
    const data = doc.data() as any
    const groupId =
      data?.groups?.[0]?.id ||
      doc.id.split('__').pop() ||
      ''
    if (groupId) existingByGroup.set(String(groupId), doc)
  })

  const groupedRows = new Map<string, EditorRow[]>()
  normalizedRows.forEach((row) => {
    if (!row.groupId) return
    const list = groupedRows.get(row.groupId) || []
    list.push(row)
    groupedRows.set(row.groupId, list)
  })

  const sanitizeGroupId = (value?: string | null) =>
    String(value || 'group')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '') || 'group'

  const batch = db.batch()
  const keptDocIds = new Set<string>()

  groups.forEach((group, index) => {
    const groupId = String(group.id || `group-${index + 1}`)
    const groupRows = groupedRows.get(groupId) || []
    const hasGroupRows = groupRows.length > 0
    const hasUsefulGroupContent =
      Number(group.workers || 0) > 0 ||
      Number(group.drivers || 0) > 0 ||
      Boolean(String(group.responsibleId || '').trim()) ||
      Boolean(String(group.responsibleName || '').trim())

    if (!hasGroupRows && !hasUsefulGroupContent) return

    const byRole = (role: EditorRole) => groupRows.filter((row) => row.role === role)
    const explicitResponsables = byRole('responsable')
    const conductorsRows = byRole('conductor')
    const treballadorsRows = byRole('treballador')
    const fallbackResponsible =
      explicitResponsables[0] ??
      ((group as any).wantsResponsible !== false ? conductorsRows[0] ?? null : null)
    const responsables = fallbackResponsible ? [fallbackResponsible] : []
    const mainResponsable = fallbackResponsible
    const responsibleActsAsDriver = !!mainResponsable?.isDriver
    const conductorsForSave = [
      ...(responsibleActsAsDriver && mainResponsable ? [mainResponsable] : []),
      ...conductorsRows,
    ]

    const names = new Set<string>()
    ;[...responsables, ...conductorsForSave, ...treballadorsRows].forEach((row) => {
      if (!row.name || row.name === 'Extra') return
      names.add(row.name.toLowerCase().trim())
    })

    const extraCount = treballadorsRows.filter((row) => row.name === 'Extra').length
    const baseGroupDoc = existingByGroup.get(groupId)
    const previous = (baseGroupDoc?.data() as any) || baseDoc
    const timingAnchor =
      conductorsForSave[0] ||
      mainResponsable ||
      groupRows[0] ||
      null
    const groupDate = group.serviceDate || groupRows[0]?.startDate || previous?.startDate || ''
    const startTime =
      timingAnchor?.startTime || group.startTime || groupRows[0]?.startTime || previous?.startTime || ''
    const endTime =
      timingAnchor?.endTime || group.endTime || groupRows[0]?.endTime || previous?.endTime || ''
    const arrivalTime =
      timingAnchor?.arrivalTime ?? group.arrivalTime ?? groupRows[0]?.arrivalTime ?? previous?.arrivalTime ?? null
    const meetingPoint =
      group.meetingPoint || timingAnchor?.meetingPoint || groupRows[0]?.meetingPoint || previous?.meetingPoint || ''
    const totalWorkers = names.size + extraCount
    const numDrivers = conductorsForSave.length
    const docId =
      baseGroupDoc?.id ||
      `${canonicalEventId}__event__${groupDate || previous?.startDate || 'nodate'}__${sanitizeGroupId(groupId)}`

    keptDocIds.add(docId)

    batch.set(
      db.collection(coll).doc(docId),
      {
        ...previous,
        department: departmentKey,
        eventId: canonicalEventId,
        startDate: groupDate || previous?.startDate || '',
        endDate: groupDate || previous?.endDate || '',
        startTime,
        endTime,
        arrivalTime,
        meetingPoint,
        responsables: responsables.map(toLine),
        conductors: conductorsForSave.map(toLine),
        treballadors: treballadorsRows.map(toLine),
        numDrivers,
        totalWorkers,
        responsable: mainResponsable ? toLine(mainResponsable) : null,
        responsableId: mainResponsable?.id || '',
        responsableName: mainResponsable?.name || '',
        status: 'draft',
        updatedAt: new Date(),
        groups: [
          {
            ...group,
            id: groupId,
            serviceDate: groupDate || null,
            meetingPoint,
            startTime,
            endTime,
            arrivalTime,
            workers: totalWorkers,
            drivers: numDrivers,
            needsDriver: numDrivers > 0,
            driverId:
              (responsibleActsAsDriver ? mainResponsable?.id : conductorsRows[0]?.id) ||
              group.driverId ||
              null,
            driverName:
              (responsibleActsAsDriver ? mainResponsable?.name : conductorsForSave[0]?.name) ||
              group.driverName ||
              null,
            responsibleId: mainResponsable?.id || null,
            responsibleName: mainResponsable?.name || null,
          },
        ],
        createdAt:
          previous?.createdAt?.toDate?.() ? previous.createdAt.toDate() : previous?.createdAt || new Date(),
      },
      { merge: true }
    )
  })

  existingDocs.forEach((doc) => {
    if (!keptDocIds.has(doc.id)) batch.delete(doc.ref)
  })

  await batch.commit()

  return {
    normalizedRows,
    updateData: {},
  } satisfies SaveDraftResult
}

const persistGenericGroupedDraft = async ({
  db,
  coll,
  sourceDocId,
  department,
  canonicalEventId,
  rows,
  groups,
}: SaveDraftContext) => {
  const ref = db.collection(coll).doc(sourceDocId || canonicalEventId)
  const snap = await ref.get()
  let createdAt = new Date()
  const existing = snap.exists ? (snap.data() as any) : null

  if (snap.exists) {
    const old = snap.data() as any
    createdAt = old?.createdAt?.toDate
      ? old.createdAt.toDate()
      : old?.createdAt || createdAt
  }

  const { normalizedRows, updateData } = buildBaseUpdateData({
    department,
    canonicalEventId,
    rows,
  })

  const nextUpdateData: Record<string, unknown> = {
    ...updateData,
    createdAt,
  }

  if (normalizedRows.some((row) => row.groupId)) {
    const persistedGroups = buildGroupedDraftPersistence({
      groups,
      existingGroups: Array.isArray(existing?.groups) ? existing.groups : [],
      existingDoc: existing,
      rows: normalizedRows,
    })

    const totalWorkers = persistedGroups.reduce((sum: number, group: any) => sum + Number(group.workers || 0), 0)
    const totalDrivers = persistedGroups.reduce((sum: number, group: any) => sum + Number(group.drivers || 0), 0)
    nextUpdateData.groups = persistedGroups
    nextUpdateData.totalWorkers = totalWorkers
    nextUpdateData.numDrivers = totalDrivers
    nextUpdateData.responsableName = persistedGroups[0]?.responsibleName || ''
    nextUpdateData.responsableId = persistedGroups[0]?.responsibleId || ''
    nextUpdateData.responsable = persistedGroups[0]?.responsibleName
      ? {
          name: persistedGroups[0].responsibleName,
          meetingPoint: persistedGroups[0].meetingPoint || '',
        }
      : null
  }

  await ref.set(nextUpdateData, { merge: true })

  return {
    normalizedRows,
    updateData: nextUpdateData,
  } satisfies SaveDraftResult
}

const persistCuinaDraft = async ({
  db,
  coll,
  sourceDocId,
  department,
  canonicalEventId,
  rows,
  groups,
}: SaveDraftContext) => {
  const ref = db.collection(coll).doc(sourceDocId || canonicalEventId)
  const snap = await ref.get()
  let createdAt = new Date()
  const existing = snap.exists ? (snap.data() as any) : null

  if (snap.exists) {
    const old = snap.data() as any
    createdAt = old?.createdAt?.toDate
      ? old.createdAt.toDate()
      : old?.createdAt || createdAt
  }

  const { normalizedRows, updateData } = buildBaseUpdateData({
    department,
    canonicalEventId,
    rows,
  })

  const nextUpdateData: Record<string, unknown> = {
    ...updateData,
    createdAt,
  }

  const groupedRows = new Map<string, EditorRow[]>()
  normalizedRows.forEach((row) => {
    const groupId = String(row.groupId || '').trim()
    if (!groupId) return
    const list = groupedRows.get(groupId) || []
    list.push(row)
    groupedRows.set(groupId, list)
  })

  const submittedGroups = Array.isArray(groups)
    ? groups.map((group, index) => ({
        ...group,
        id: String(group?.id || `group-${index + 1}`),
      }))
    : []
  const existingGroups = Array.isArray(existing?.groups)
    ? existing.groups.map((group: any, index: number) => ({
        ...group,
        id: String(group?.id || `group-${index + 1}`),
      }))
    : []

  const submittedGroupIds = submittedGroups
    .map((group) => String(group.id || '').trim())
    .filter(Boolean)

  const orderedGroupIds = submittedGroupIds.length > 0
    ? submittedGroupIds.filter((groupId) => groupedRows.has(groupId))
    : Array.from(groupedRows.keys())

  const groupMetaById = new Map<string, EditorGroup>()
  submittedGroups.forEach((group) => {
    const groupId = String(group.id || '').trim()
    if (!groupId) return
    groupMetaById.set(groupId, group)
  })
  existingGroups.forEach((group: any) => {
    const groupId = String(group.id || '').trim()
    if (!groupId || groupMetaById.has(groupId)) return
    groupMetaById.set(groupId, group)
  })

  const persistedGroups = orderedGroupIds.map((groupId) => {
    const groupRows = groupedRows.get(groupId) || []
    const first = groupRows[0]
    const groupMeta = groupMetaById.get(groupId) || {}
    const previousGroup =
      existingGroups.find((candidate: any) => String(candidate?.id || '').trim() === groupId) || {}
    const responsables = groupRows.filter((row) => row.role === 'responsable')
    const conductors = groupRows.filter((row) => row.role === 'conductor')
    const treballadors = groupRows.filter((row) => row.role === 'treballador')

    const uniqueNames = new Set<string>()
    ;[...responsables, ...conductors, ...treballadors].forEach((row) => {
      const name = String(row.name || '').trim()
      if (!name || name === 'Extra') return
      uniqueNames.add(name.toLowerCase())
    })

    return {
      ...previousGroup,
      ...groupMeta,
      id: groupId,
      serviceDate:
        groupMeta.serviceDate ||
        previousGroup.serviceDate ||
        first?.startDate ||
        existing?.startDate ||
        '',
      meetingPoint:
        first?.meetingPoint ||
        groupMeta.meetingPoint ||
        previousGroup.meetingPoint ||
        existing?.meetingPoint ||
        '',
      startTime:
        first?.startTime ||
        groupMeta.startTime ||
        previousGroup.startTime ||
        existing?.startTime ||
        '',
      arrivalTime:
        first?.arrivalTime ??
        groupMeta.arrivalTime ??
        previousGroup.arrivalTime ??
        existing?.arrivalTime ??
        null,
      endTime:
        first?.endTime ||
        groupMeta.endTime ||
        previousGroup.endTime ||
        existing?.endTime ||
        '',
      workers: uniqueNames.size + (groupRows.some((row) => row.name === 'Extra') ? 1 : 0),
      drivers: conductors.length,
      responsibleName: responsables[0]?.name || null,
      responsibleId: responsables[0]?.id || null,
    }
  })

  nextUpdateData.groups = persistedGroups
  nextUpdateData.totalWorkers = persistedGroups.reduce(
    (sum: number, group: any) => sum + Number(group.workers || 0),
    0
  )
  nextUpdateData.numDrivers = persistedGroups.reduce(
    (sum: number, group: any) => sum + Number(group.drivers || 0),
    0
  )
  nextUpdateData.responsableName = persistedGroups[0]?.responsibleName || ''
  nextUpdateData.responsableId = persistedGroups[0]?.responsibleId || ''
  nextUpdateData.responsable = persistedGroups[0]?.responsibleName
    ? {
        name: persistedGroups[0].responsibleName,
        meetingPoint: persistedGroups[0].meetingPoint || '',
      }
    : null

  await ref.set(nextUpdateData, { merge: true })

  return {
    normalizedRows,
    updateData: nextUpdateData,
  } satisfies SaveDraftResult
}

export async function saveDraftByDepartment(
  context: SaveDraftContext
): Promise<SaveDraftResult> {
  const departmentKey = normalizeDepartmentKey(context.department)

  if (departmentKey === 'serveis') {
    const serveisResult = await persistServeisDraft(context)
    if (serveisResult) return serveisResult
  }

  if (departmentKey === 'cuina') {
    return persistCuinaDraft(context)
  }

  return persistGenericGroupedDraft(context)
}
