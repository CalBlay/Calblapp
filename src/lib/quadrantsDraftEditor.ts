import {
  getExternalWorkerBaseLabel,
  getExternalWorkerTypeFromName,
  normalizeExternalWorkerName,
  type ExternalWorkerType,
} from '@/lib/quadrantExternalWorkers'

export type EditorRole = 'responsable' | 'conductor' | 'treballador'

export type EditorRow = {
  role: EditorRole
  id: string
  name: string
  isExternal?: boolean
  externalType?: ExternalWorkerType
  isCenterExternalExtra?: boolean
  isDriver?: boolean
  isJamonero?: boolean
  groupId?: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  meetingPoint?: string
  arrivalTime?: string
  vehicleType?: string
  plate?: string
}

export type EditorGroup = {
  id?: string | null
  serviceDate?: string | null
  dateLabel?: string | null
  meetingPoint?: string
  startTime?: string
  arrivalTime?: string | null
  endTime?: string
  workers?: number
  drivers?: number
  needsDriver?: boolean
  driverId?: string | null
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
}

export type EditorDraftInput = {
  id: string
  code?: string
  eventName?: string
  location?: string | Record<string, unknown>
  department?: string
  startDate: string
  startTime?: string
  endDate?: string
  endTime?: string
  arrivalTime?: string | null
  meetingPoint?: string
  groups?: EditorGroup[]
  /** Firestore / client sync stamp; triggers editor reset when changed */
  updatedAt?: string | number | { toDate?: () => Date }
  responsablesNeeded?: number
  numDrivers?: number
  totalWorkers?: number
  status?: string
  responsableId?: string
  responsableName?: string | Record<string, unknown>
  responsable?: Partial<EditorRow> | null
  conductors?: Array<Partial<EditorRow>>
  treballadors?: Array<Partial<EditorRow>>
  legacyBrigades?: Array<
    Partial<EditorRow> & {
      workers?: number
    }
  >
  timetables?: Array<{ startTime: string; endTime: string }>
  vestimentModel?: string | null
}

export type DraftEditorModel = {
  department: string
  rows: EditorRow[]
  groups: EditorGroup[]
  hasStructuredGroups: boolean
  isCuinaDept: boolean
  isServeisDept: boolean
  defaultMeetingPoint: string
}

export const normalizeDraftKey = (value?: string) =>
  (value || '').toString().toLowerCase().trim()

export const normalizeDraftText = (value?: string) =>
  (value || '').toLowerCase().trim()

export const normalizeDepartmentKey = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export const isExternalEttName = (value?: string) => {
  return getExternalWorkerTypeFromName(value) !== null
}

const shouldDeduplicateName = (value?: string) => {
  const normalized = normalizeDraftText(value)
  if (!normalized || normalized === 'extra') return false
  return !isExternalEttName(value)
}

export const buildStructuredGroups = (groups?: EditorDraftInput['groups']) =>
  (Array.isArray(groups) ? groups : [])
    .filter((group) => {
      if (!group) return false
      return (
        Boolean(String(group.id || '').trim()) ||
        Boolean(String(group.serviceDate || '').trim()) ||
        Boolean(String(group.dateLabel || '').trim()) ||
        Boolean(String(group.meetingPoint || '').trim()) ||
        Boolean(String(group.startTime || '').trim()) ||
        Boolean(String(group.endTime || '').trim()) ||
        Boolean(String(group.arrivalTime || '').trim()) ||
        Number(group.workers || 0) > 0 ||
        Number(group.drivers || 0) > 0 ||
        Boolean(String(group.responsibleId || '').trim()) ||
        Boolean(String(group.responsibleName || '').trim())
      )
    })
    .map((group, idx) => ({
      ...group,
      id: group.id || `group-${idx + 1}`,
    }))

const expandLegacyBrigadesToExternalRows = (
  legacyBrigades: EditorDraftInput['legacyBrigades'] | undefined,
  fallback: {
    startDate: string
    startTime?: string
    endDate?: string
    endTime?: string
    meetingPoint: string
    arrivalTime?: string | null
  }
): EditorRow[] =>
  (Array.isArray(legacyBrigades) ? legacyBrigades : []).flatMap((brig) => {
    const count = Math.max(1, Number(brig?.workers || 0))
    const baseName = String(brig?.name || 'ETT').trim() || 'ETT'
    const externalType = getExternalWorkerTypeFromName(baseName) || 'ett'
    return Array.from({ length: count }, () => ({
      id: '',
      name: baseName || getExternalWorkerBaseLabel(externalType),
      role: 'treballador' as const,
      isExternal: true,
      externalType,
      startDate: brig?.startDate || fallback.startDate,
      startTime: brig?.startTime || fallback.startTime || '',
      endDate: brig?.endDate || fallback.endDate || fallback.startDate,
      endTime: brig?.endTime || fallback.endTime || '',
      meetingPoint: brig?.meetingPoint || fallback.meetingPoint,
      arrivalTime: brig?.arrivalTime || fallback.arrivalTime || '',
      plate: '',
      vehicleType: '',
    }))
  })

const resolveDraftNameById = (draft: EditorDraftInput, id: string) => {
  if (!id) return ''
  if (draft.responsable?.id === id) return draft.responsable?.name || ''
  const driver = (draft.conductors || []).find((c) => c.id === id)
  if (driver?.name) return driver.name
  const worker = (draft.treballadors || []).find((t) => t.id === id)
  if (worker?.name) return worker.name
  return ''
}

type BuildGroupedRowsParams = {
  draft: EditorDraftInput
  groupDefs: EditorGroup[]
  defaultMeetingPoint: string
  department: string
  isServeisDept: boolean
}

const findBestGroupIdForRow = (
  row: Partial<EditorRow>,
  groupDefs: EditorGroup[],
  fallbackGroupId?: string
) => {
  const rowDate = row.startDate || ''
  const rowStart = row.startTime || ''
  const rowEnd = row.endTime || ''
  const rowMeetingPoint = row.meetingPoint || ''

  const exactMatch = groupDefs.find((group, idx) => {
    const groupId = group.id || `group-${idx + 1}`
    const groupDate = group.serviceDate || ''
    const groupStart = group.startTime || ''
    const groupEnd = group.endTime || ''
    const groupMeetingPoint = group.meetingPoint || ''
    return (
      groupId &&
      groupDate === rowDate &&
      groupStart === rowStart &&
      groupEnd === rowEnd &&
      groupMeetingPoint === rowMeetingPoint
    )
  })

  if (exactMatch?.id) return exactMatch.id

  const timeMatch = groupDefs.find((group, idx) => {
    const groupId = group.id || `group-${idx + 1}`
    const groupDate = group.serviceDate || ''
    const groupStart = group.startTime || ''
    const groupEnd = group.endTime || ''
    return groupId && groupDate === rowDate && groupStart === rowStart && groupEnd === rowEnd
  })

  if (timeMatch?.id) return timeMatch.id

  return fallbackGroupId || groupDefs[0]?.id || undefined
}

const buildGroupedRows = ({
  draft,
  groupDefs,
  defaultMeetingPoint,
  department,
  isServeisDept,
}: BuildGroupedRowsParams): EditorRow[] => {
  const isCuinaDept = department === 'cuina'
  const rows: EditorRow[] = []
  const driversPool = [...(draft.conductors || [])]
  const driverNameSet = new Set(
    (draft.conductors || [])
      .map((c) => normalizeDraftText(c?.name))
      .filter(Boolean)
  )

  if (isServeisDept && Array.isArray(draft.groups)) {
    draft.groups.forEach((g: any) => {
      const dn = normalizeDraftText(g?.driverName)
      if (dn) driverNameSet.add(dn)
    })
  }

  const extrasFromDoc = isCuinaDept
    ? 0
    : (draft.treballadors || []).filter(
        (w) => normalizeDraftText(w?.name) === 'extra'
      ).length
  const workersPool = [...(draft.treballadors || [])]
    .filter((w) => normalizeDraftText(w?.name) !== 'extra')
    .filter((w) => !driverNameSet.has(normalizeDraftText(w?.name)))
  let extrasNeeded = extrasFromDoc
  let missingWorkersNeeded = 0
  const usedNames = new Set<string>()

  const takePreferredServiceDriver = (group: any) => {
    const preferredId = String(group?.driverId || '').trim()
    const preferredName = normalizeDraftText(group?.driverName)

    const preferredIdx = driversPool.findIndex((driver) => {
      const driverId = String(driver?.id || '').trim()
      const driverName = normalizeDraftText(driver?.name)
      if (preferredId && driverId === preferredId) return true
      if (preferredName && driverName === preferredName) return true
      return false
    })

    if (preferredIdx >= 0) {
      const [preferred] = driversPool.splice(preferredIdx, 1)
      return preferred || null
    }

    return null
  }

  const takePreferredWorker = (groupId: string, allowFallback = true) => {
    const preferredIdx = workersPool.findIndex((worker) => String((worker as any)?.groupId || '') === groupId)
    if (preferredIdx >= 0) {
      const [preferred] = workersPool.splice(preferredIdx, 1)
      return preferred || null
    }
    if (!allowFallback) return null
    return workersPool.shift() || null
  }

  groupDefs.forEach((group, idx) => {
    const groupId = group.id || `group-${idx + 1}`
    const groupDate = group.serviceDate || draft.startDate
    const groupStartTime = group.startTime || draft.startTime || ''
    const groupEndTime = group.endTime || draft.endTime || ''
    const groupArrivalTime = group.arrivalTime || draft.arrivalTime || ''
    const groupMeetingPoint = group.meetingPoint || defaultMeetingPoint
    const respId = group.responsibleId || (idx === 0 ? draft.responsableId || '' : '')
    let respName =
      group.responsibleName ||
      resolveDraftNameById(draft, respId) ||
      (idx === 0 && typeof draft.responsableName === 'string' ? draft.responsableName : '')

    if (shouldDeduplicateName(respName) && usedNames.has(normalizeDraftText(respName))) {
      respName = ''
    }

    const hasResponsible = Boolean(respName || respId)
    const respRowIndex = hasResponsible ? rows.length : -1
    const preferredDriverRow = isServeisDept ? takePreferredServiceDriver(group) : null
    const mainDriverRow =
      isServeisDept ? preferredDriverRow || driversPool[0] || null : null

    if (hasResponsible) {
      rows.push({
        id: respId || '',
        name: respName || '',
        role: 'responsable',
        isDriver: false,
        groupId,
        startDate: groupDate,
        startTime: mainDriverRow?.startTime || groupStartTime,
        endDate: draft.endDate || groupDate,
        endTime: mainDriverRow?.endTime || groupEndTime,
        meetingPoint: groupMeetingPoint,
        arrivalTime: mainDriverRow?.arrivalTime || groupArrivalTime,
        plate: '',
        vehicleType: '',
        isJamonero: false,
      })
    }

    const driversNeeded = Number(group.drivers || 0)
    const assignedDrivers: Array<{ name?: string }> = []

    if (isServeisDept) {
      if (driversNeeded > 0) {
        let driverName = ''
        let next = preferredDriverRow || driversPool.shift()
        while (
          next?.name &&
          shouldDeduplicateName(next.name) &&
          usedNames.has(normalizeDraftText(next.name))
        ) {
          next = driversPool.shift()
        }
        driverName = next?.name || ''
        if (!driverName) {
          driverName =
            (group as any).driverName ||
            resolveDraftNameById(draft, (group as any).driverId || '') ||
            ''
        }
        if (!driverName) driverName = 'Extra'
        assignedDrivers.push({ name: driverName })

        const samePersonAsResponsible =
          hasResponsible &&
          driverName &&
          respName &&
          normalizeDraftText(driverName) === normalizeDraftText(respName)

        if (samePersonAsResponsible && respRowIndex >= 0) {
          rows[respRowIndex] = {
            ...rows[respRowIndex],
            isDriver: true,
          }
        }

        if (!samePersonAsResponsible) {
          rows.push({
            id: (group as any).driverId || '',
            name: driverName,
            role: 'conductor',
            isJamonero: next?.isJamonero === true,
            groupId,
            startDate: next?.startDate || groupDate,
            startTime: next?.startTime || groupStartTime,
            endDate: next?.endDate || draft.endDate || groupDate,
            endTime: next?.endTime || groupEndTime,
            meetingPoint: next?.meetingPoint || groupMeetingPoint,
            arrivalTime: next?.arrivalTime || groupArrivalTime,
            plate: '',
            vehicleType: '',
          })
        }
      }
    } else {
      for (let i = 0; i < driversNeeded; i += 1) {
        let driver = driversPool.shift()
        while (
          driver?.name &&
          shouldDeduplicateName(driver.name) &&
          usedNames.has(normalizeDraftText(driver.name))
        ) {
          driver = driversPool.shift()
        }
        assignedDrivers.push({ name: driver?.name })
        rows.push({
          id: driver?.id || '',
          name: driver?.name || 'Extra',
          role: 'conductor',
          isJamonero: driver?.isJamonero === true,
          groupId,
          startDate: groupDate,
          startTime: groupStartTime,
          endDate: draft.endDate || groupDate,
          endTime: groupEndTime,
          meetingPoint: groupMeetingPoint,
          arrivalTime: groupArrivalTime,
          plate: driver?.plate || '',
          vehicleType: driver?.vehicleType || '',
        })
      }
    }

    const responsibleIsDriver =
      hasResponsible &&
      assignedDrivers.some((p) => p.name && normalizeDraftText(p.name) === normalizeDraftText(respName))
    const workersNeeded = Math.max(
      Number(group.workers || 0) - driversNeeded - (hasResponsible ? (responsibleIsDriver ? 0 : 1) : 0),
      0
    )
    const assignedWorkers: Array<{ name?: string }> = []

    for (let i = 0; i < workersNeeded; i += 1) {
      let worker = takePreferredWorker(groupId, !isCuinaDept)
      while (
        worker?.name &&
        shouldDeduplicateName(worker.name) &&
        usedNames.has(normalizeDraftText(worker.name))
      ) {
        worker = takePreferredWorker(groupId, !isCuinaDept)
      }
      const workerName = worker?.name || ''
      if (!workerName) {
        if (!isCuinaDept) missingWorkersNeeded += 1
      } else {
        assignedWorkers.push({ name: workerName })
        rows.push({
          id: worker?.id || '',
          name: workerName,
          role: 'treballador',
          isExternal: isExternalEttName(workerName),
          externalType: getExternalWorkerTypeFromName(workerName) || undefined,
          isJamonero: worker?.isJamonero === true,
          groupId,
          startDate: worker?.startDate || groupDate,
          startTime: worker?.startTime || groupStartTime,
          endDate: worker?.endDate || draft.endDate || groupDate,
          endTime: worker?.endTime || groupEndTime,
          meetingPoint: worker?.meetingPoint || groupMeetingPoint,
          arrivalTime: worker?.arrivalTime || groupArrivalTime,
          plate: '',
          vehicleType: '',
        })
      }
    }

    extrasNeeded = Math.max(extrasNeeded, missingWorkersNeeded)

    if (respRowIndex >= 0 && !rows[respRowIndex]?.name && department !== 'serveis') {
      const candidate =
        assignedWorkers.find((p) => p.name && p.name !== 'Extra') ||
        assignedDrivers.find((p) => p.name && p.name !== 'Extra')
      if (candidate?.name) rows[respRowIndex].name = candidate.name
    }

    const groupNames = [
      rows[respRowIndex]?.name,
      ...assignedDrivers.map((p) => p.name),
      ...assignedWorkers.map((p) => p.name),
    ]
      .filter((name) => typeof name === 'string' && shouldDeduplicateName(name as string))
      .map((name) => normalizeDraftText(name as string))
    groupNames.forEach((name) => usedNames.add(name))
  })

  rows.push(
    ...expandLegacyBrigadesToExternalRows(draft.legacyBrigades, {
      startDate: draft.startDate,
      startTime: draft.startTime,
      endDate: draft.endDate,
      endTime: draft.endTime,
      meetingPoint: defaultMeetingPoint,
      arrivalTime: draft.arrivalTime,
    })
  )

  const remainingWorkers = workersPool.map((worker) => ({
    id: worker?.id || '',
    name: worker?.name || '',
    role: 'treballador' as const,
    isExternal: isExternalEttName(worker?.name),
    externalType: getExternalWorkerTypeFromName(worker?.name) || undefined,
    groupId:
      String((worker as any)?.groupId || '').trim() ||
      findBestGroupIdForRow(
        {
          startDate: worker?.startDate || draft.startDate,
          startTime: worker?.startTime || draft.startTime || '',
          endTime: worker?.endTime || draft.endTime || '',
          meetingPoint: worker?.meetingPoint || defaultMeetingPoint,
        },
        groupDefs
      ),
    startDate: worker?.startDate || draft.startDate,
    startTime: worker?.startTime || draft.startTime || '',
    endDate: worker?.endDate || draft.endDate || draft.startDate,
    endTime: worker?.endTime || draft.endTime || '',
    meetingPoint: worker?.meetingPoint || defaultMeetingPoint,
    arrivalTime: worker?.arrivalTime || draft.arrivalTime || '',
    plate: '',
    vehicleType: '',
  }))

  if (remainingWorkers.length) {
    rows.push(...remainingWorkers)
  }

  if (!isCuinaDept && extrasNeeded > 0) {
    rows.push(
      ...Array.from({ length: extrasNeeded }, () => ({
        id: '',
        name: 'ETT',
        role: 'treballador' as const,
        isExternal: true,
        externalType: 'ett' as const,
        startDate: draft.startDate,
        startTime: draft.startTime || '',
        endDate: draft.endDate || draft.startDate,
        endTime: draft.endTime || '',
        meetingPoint: defaultMeetingPoint,
        arrivalTime: draft.arrivalTime || '',
        plate: '',
        vehicleType: '',
      }))
    )
  }

  return rows
}

const buildReservedPersonKeys = (draft: EditorDraftInput) => {
  const reserved = new Set<string>()
  const push = (value?: string) => {
    const key = normalizeDraftText(value)
    if (key) reserved.add(key)
  }

  if (typeof draft.responsableName === 'string') push(draft.responsableName)
  push(draft.responsable?.name)
  ;(draft.conductors || []).forEach((c) => push(c?.name))

  return reserved
}

export const buildInitialRowsBase = ({
  draft,
  hasStructuredGroups,
  groupDefs,
  defaultMeetingPoint,
  department,
  isCuinaDept,
  isServeisDept,
}: {
  draft: EditorDraftInput
  hasStructuredGroups: boolean
  groupDefs: EditorGroup[]
  defaultMeetingPoint: string
  department: string
  isCuinaDept: boolean
  isServeisDept: boolean
}): EditorRow[] =>
  hasStructuredGroups
    ? buildGroupedRows({
        draft,
        groupDefs,
        defaultMeetingPoint,
        department,
        isServeisDept,
      })
    : [
        ...(draft.responsableName &&
        typeof draft.responsableName === 'string'
          ? [
              {
                id: draft.responsable?.id || '',
                name: draft.responsableName,
                role: 'responsable' as const,
                startDate: draft.responsable?.startDate || draft.startDate,
                startTime: draft.responsable?.startTime || draft.startTime || '',
                endDate: draft.responsable?.endDate || draft.endDate || draft.startDate,
                endTime: draft.responsable?.endTime || draft.endTime || '',
                meetingPoint: draft.responsable?.meetingPoint || defaultMeetingPoint,
                arrivalTime: draft.responsable?.arrivalTime || draft.arrivalTime || '',
                plate: draft.responsable?.plate || '',
                vehicleType: draft.responsable?.vehicleType || '',
              },
            ]
          : []),
        ...(draft.conductors || []).map((c) => ({
          id: c.id || '',
          name: c.name || '',
          role: 'conductor' as const,
          startDate: c.startDate || draft.startDate,
          startTime: c.startTime || draft.startTime || '',
          endDate: c.endDate || draft.endDate || draft.startDate,
          endTime: c.endTime || draft.endTime || '',
          meetingPoint: c.meetingPoint || defaultMeetingPoint,
          arrivalTime: c.arrivalTime || draft.arrivalTime || '',
          plate: c.plate || '',
          vehicleType: c.vehicleType || '',
        })),
        ...(() => {
          const reservedPersonKeys =
            department === 'logistica' ? buildReservedPersonKeys(draft) : new Set<string>()

          return (draft.treballadors || [])
            .filter((t) => {
              if (isCuinaDept && normalizeDraftText(t.name) === 'extra') return false
              if (department !== 'logistica') return true
              const key = normalizeDraftText(t.name)
              if (!key || key === 'extra') return true
              return !reservedPersonKeys.has(key)
            })
            .map((t) => ({
              id: t.id || '',
              name: t.name || '',
              role: 'treballador' as const,
              isExternal:
                isCuinaDept &&
                isExternalEttName(t.name),
              externalType:
                getExternalWorkerTypeFromName(t.name) || undefined,
              startDate: t.startDate || draft.startDate,
              startTime: t.startTime || draft.startTime || '',
              endDate: t.endDate || draft.endDate || draft.startDate,
              endTime: t.endTime || draft.endTime || '',
              meetingPoint: t.meetingPoint || defaultMeetingPoint,
              arrivalTime: t.arrivalTime || draft.arrivalTime || '',
              plate: '',
              vehicleType: '',
            }))
        })(),
        ...expandLegacyBrigadesToExternalRows(draft.legacyBrigades, {
          startDate: draft.startDate,
          startTime: draft.startTime,
          endDate: draft.endDate,
          endTime: draft.endTime,
          meetingPoint: defaultMeetingPoint,
          arrivalTime: draft.arrivalTime,
        }),
      ]

export const buildDraftEditorModel = (draft: EditorDraftInput): DraftEditorModel => {
  const department = String(draft.department || '').toLowerCase()
  const isCuinaDept = department === 'cuina'
  const isServeisDept = department === 'serveis'
  const defaultMeetingPoint = draft.meetingPoint || ''
  const groups = buildStructuredGroups(draft.groups)
  const hasStructuredGroups = groups.length > 0
  const rows = buildInitialRowsBase({
    draft,
    hasStructuredGroups,
    groupDefs: groups,
    defaultMeetingPoint,
    department,
    isCuinaDept,
    isServeisDept,
  })

  return {
    department,
    rows,
    groups,
    hasStructuredGroups,
    isCuinaDept,
    isServeisDept,
    defaultMeetingPoint,
  }
}

export const pruneEditorGroups = ({
  department,
  rows,
  groups,
}: {
  department: string
  rows: EditorRow[]
  groups: EditorGroup[]
}) =>
  groups.filter((group) => {
    const departmentKey = normalizeDepartmentKey(department)
    const groupId = String(group?.id || '').trim()
    if (!groupId) return false

    const hasRows = rows.some((row) => String(row.groupId || '').trim() === groupId)
    if (departmentKey === 'cuina') return hasRows
    if (hasRows) return true

    const hasUsefulContent =
      Number(group.workers || 0) > 0 ||
      Number(group.drivers || 0) > 0 ||
      Boolean(String(group.responsibleId || '').trim()) ||
      Boolean(String(group.responsibleName || '').trim())

    return hasUsefulContent
  })

export const normalizeRowsForDepartmentSave = ({
  rows,
}: {
  rows: EditorRow[]
}) => {
  return rows.map((row) => {
    if (row.role !== 'treballador' || !row.isExternal) return row

    const externalType =
      row.externalType ||
      (row.isCenterExternalExtra ? 'centerExternalExtra' : null) ||
      getExternalWorkerTypeFromName(row.name) ||
      'ett'

    return {
      ...row,
      id: '',
      externalType,
      name: normalizeExternalWorkerName({
        rawName: row.name,
        type: externalType,
      }),
    }
  })
}

export const buildGroupedDraftPersistence = ({
  groups,
  existingGroups,
  existingDoc,
  rows,
}: {
  groups?: EditorGroup[]
  existingGroups?: EditorGroup[]
  existingDoc?: Record<string, any> | null
  rows: EditorRow[]
}) => {
  const submittedGroups = Array.isArray(groups)
    ? groups.map((g, index) => ({
        ...g,
        id: String(g?.id || `group-${index + 1}`),
      }))
    : []
  const previousGroups = Array.isArray(existingGroups)
    ? existingGroups.map((g, index) => ({
        ...g,
        id: String(g?.id || `group-${index + 1}`),
      }))
    : []
  const workingGroups = submittedGroups.length > 0 ? submittedGroups : previousGroups

  const groupedRows = new Map<string, EditorRow[]>()
  rows.forEach((row) => {
    if (!row.groupId) return
    const list = groupedRows.get(row.groupId) || []
    list.push(row)
    groupedRows.set(row.groupId, list)
  })

  const groupMetaById = new Map<string, EditorGroup>()
  workingGroups.forEach((group, index) => {
    const groupId = String(group?.id || `group-${index + 1}`)
    groupMetaById.set(groupId, { ...group, id: groupId })
  })

  const orderedGroupIds = [
    ...workingGroups
      .map((group, index) => String(group?.id || `group-${index + 1}`))
      .filter((groupId) => groupedRows.has(groupId)),
    ...Array.from(groupedRows.keys()).filter(
      (groupId, index, arr) =>
        !groupMetaById.has(groupId) &&
        arr.findIndex((candidate) => candidate === groupId) === index
    ),
  ]

  return orderedGroupIds.map((groupId) => {
    const group: Partial<EditorGroup> = groupMetaById.get(groupId) || {}
    const groupRows = groupedRows.get(groupId) || []
    const first = groupRows[0]
    const byRole = (role: EditorRole) => groupRows.filter((row) => row.role === role)
    const responsables = byRole('responsable')
    const conductorsGroup = byRole('conductor')
    const treballadorsGroup = byRole('treballador')

    const names = new Set<string>()
    ;[...responsables, ...conductorsGroup, ...treballadorsGroup].forEach((row) => {
      if (!row.name || row.name === 'Extra') return
      names.add(row.name.toLowerCase().trim())
    })

    const workersTotal = names.size + (groupRows.some((row) => row.name === 'Extra') ? 1 : 0)
    const driversTotal = conductorsGroup.length
    const responsibleName = responsables[0]?.name || null
    const responsibleId = responsables[0]?.id || null
    const base: Partial<EditorGroup> =
      previousGroups.find((candidate) => String(candidate?.id || '') === groupId) || {}

    return {
      ...base,
      ...group,
      id: groupId,
      serviceDate:
        group.serviceDate ||
        first?.startDate ||
        base.serviceDate ||
        existingDoc?.startDate ||
        '',
      meetingPoint:
        first?.meetingPoint ||
        group.meetingPoint ||
        base.meetingPoint ||
        existingDoc?.meetingPoint ||
        '',
      startTime:
        first?.startTime ||
        group.startTime ||
        base.startTime ||
        existingDoc?.startTime ||
        '',
      arrivalTime:
        first?.arrivalTime ??
        group.arrivalTime ??
        base.arrivalTime ??
        existingDoc?.arrivalTime ??
        null,
      endTime:
        first?.endTime ||
        group.endTime ||
        base.endTime ||
        existingDoc?.endTime ||
        '',
      workers: workersTotal,
      drivers: driversTotal,
      responsibleName,
      responsibleId,
    }
  })
}
