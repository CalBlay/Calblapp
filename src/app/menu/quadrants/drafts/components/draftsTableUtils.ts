import type { DraftInput, Row } from './types'

export const normalizeDraftKey = (value?: string) =>
  (value || '').toString().toLowerCase().trim()

export const normalizeDraftText = (value?: string) =>
  (value || '').toLowerCase().trim()

export const isExternalEttName = (value?: string) => {
  const normalized = normalizeDraftText(value)
  return normalized === 'ett' || normalized.startsWith('ett -')
}

const shouldDeduplicateName = (value?: string) => {
  const normalized = normalizeDraftText(value)
  if (!normalized || normalized === 'extra') return false
  return !isExternalEttName(value)
}

export const buildStructuredGroups = (groups?: DraftInput['groups']) =>
  (Array.isArray(groups) ? groups : []).map((group, idx) => ({
    ...group,
    id: group.id || `group-${idx + 1}`,
  }))

const expandLegacyBrigadesToExternalRows = (
  legacyBrigades: DraftInput['legacyBrigades'] | undefined,
  fallback: {
    startDate: string
    startTime?: string
    endDate?: string
    endTime?: string
    meetingPoint: string
    arrivalTime?: string | null
  }
): Row[] =>
  (Array.isArray(legacyBrigades) ? legacyBrigades : []).flatMap((brig) => {
    const count = Math.max(1, Number(brig?.workers || 0))
    const baseName = String(brig?.name || 'ETT').trim() || 'ETT'
    const normalizedBase = normalizeDraftText(baseName)
    return Array.from({ length: count }, () => ({
      id: '',
      name: normalizedBase === 'ett' ? 'ETT' : baseName,
      role: 'treballador' as const,
      isExternal: normalizedBase === 'ett' || isExternalEttName(baseName),
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

export const resolveDraftNameById = (draft: DraftInput, id: string) => {
  if (!id) return ''
  if (draft.responsable?.id === id) return draft.responsable?.name || ''
  const driver = (draft.conductors || []).find((c) => c.id === id)
  if (driver?.name) return driver.name
  const worker = (draft.treballadors || []).find((t) => t.id === id)
  if (worker?.name) return worker.name
  return ''
}

type BuildGroupedRowsParams = {
  draft: DraftInput
  groupDefs: Array<any>
  defaultMeetingPoint: string
  department: string
  isServeisDept: boolean
}

const findBestGroupIdForRow = (
  row: Partial<Row>,
  groupDefs: Array<any>,
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

export const buildGroupedRows = ({
  draft,
  groupDefs,
  defaultMeetingPoint,
  department,
  isServeisDept,
}: BuildGroupedRowsParams): Row[] => {
  const rows: Row[] = []
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

  const extrasFromDoc = (draft.treballadors || []).filter(
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

  groupDefs.forEach((group, idx) => {
    const groupId = group.id || `group-${idx + 1}`
    const groupDate = (group as any).serviceDate || draft.startDate
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
      let worker = workersPool.shift()
      while (
        worker?.name &&
        shouldDeduplicateName(worker.name) &&
        usedNames.has(normalizeDraftText(worker.name))
      ) {
        worker = workersPool.shift()
      }
      const workerName = worker?.name || ''
      if (!workerName) {
        missingWorkersNeeded += 1
      } else {
        assignedWorkers.push({ name: workerName })
        rows.push({
          id: worker?.id || '',
          name: workerName,
          role: 'treballador',
          isExternal: isExternalEttName(workerName),
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
    groupId: findBestGroupIdForRow(
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

  if (extrasNeeded > 0) {
    rows.push(
      ...Array.from({ length: extrasNeeded }, () => ({
        id: '',
        name: 'ETT',
        role: 'treballador' as const,
        isExternal: true,
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

type BuildInitialRowsBaseParams = {
  draft: DraftInput
  hasStructuredGroups: boolean
  groupDefs: Array<any>
  defaultMeetingPoint: string
  department: string
  isCuinaDept: boolean
  isServeisDept: boolean
}

const buildReservedPersonKeys = (draft: DraftInput) => {
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
}: BuildInitialRowsBaseParams): Row[] =>
  hasStructuredGroups
    ? buildGroupedRows({
        draft,
        groupDefs,
        defaultMeetingPoint,
        department,
        isServeisDept,
      })
    : [
        ...(draft.responsableName
          && typeof draft.responsableName === 'string'
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
              if (department !== 'logistica') return true
              const key = normalizeDraftText(t.name)
              if (!key || key === 'extra') return true
              return !reservedPersonKeys.has(key)
            })
            .map((t) => ({
              id: t.id || '',
              name: isCuinaDept && normalizeDraftText(t.name) === 'extra' ? 'ETT' : t.name || '',
              role: 'treballador' as const,
              isExternal:
                isCuinaDept &&
                (normalizeDraftText(t.name) === 'extra' || isExternalEttName(t.name)),
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
