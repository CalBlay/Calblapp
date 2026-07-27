import { normalizeEventId } from '@/lib/quadrantsPost/utils'
import type {
  CuinaGroup,
  ExternalWorkerLine,
  InternalWorkerLine,
  QuadrantSave,
  QuadrantSaveRequestBody,
} from '@/lib/quadrantsPost/types'

export function buildQuadrantSave(
  deptNorm: string,
  mode: 'auto' | 'semi' | 'manual',
  bodyForSave: QuadrantSaveRequestBody,
  assignmentForSave: {
    responsible?: { name: string } | null
    drivers?: Array<{
      name: string
      meetingPoint?: string
      plate?: string
      vehicleType?: string
      isJamonero?: boolean
    }>
    staff?: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
  },
  metaForSave: { needsReview?: boolean; violations?: string[]; notes?: string[] }
) {
  const normalizeTimeField = (value: unknown) =>
    typeof value === 'string' ? value.trim() : ''

  const toTimetableEntry = ({
    startTime,
    endTime,
  }: { startTime?: unknown; endTime?: unknown }) => {
    const start = normalizeTimeField(startTime)
    const end = normalizeTimeField(endTime)
    return start && end ? { startTime: start, endTime: end } : null
  }

  const rawTimetables = Array.isArray(bodyForSave.timetables)
    ? bodyForSave.timetables
    : []
  const normalizedTimetables = rawTimetables
    .map((entry) => toTimetableEntry(entry as { startTime?: unknown; endTime?: unknown }))
    .filter((entry): entry is { startTime: string; endTime: string } => Boolean(entry))

  const staffRaw = (assignmentForSave.staff || []).filter((s) => s?.name)
  const externalWorkersRaw = Array.isArray(bodyForSave.externalWorkers)
    ? bodyForSave.externalWorkers.filter((s) => s?.name)
    : []
  const staffClean = staffRaw.filter((s) => s.name !== 'Extra')
  const internalWorkerLines: InternalWorkerLine[] = staffClean.map((s) => ({
    name: s.name,
    meetingPoint: s.meetingPoint || bodyForSave.meetingPoint || '',
    isJamonero: s.isJamonero === true,
  }))
  const externalWorkerLines: ExternalWorkerLine[] = externalWorkersRaw.map((worker) => ({
    name: worker.name || '',
    meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
    startDate: worker.startDate || bodyForSave.startDate || '',
    endDate: worker.endDate || bodyForSave.endDate || '',
    startTime: worker.startTime || bodyForSave.startTime || '00:00',
    endTime: worker.endTime || bodyForSave.endTime || '00:00',
    arrivalTime: worker.arrivalTime || bodyForSave.arrivalTime || null,
    isExternal: worker.isExternal === true,
  }))

  const bodyRecord = bodyForSave as Record<string, unknown>
  const manualRespId = String(bodyForSave.manualResponsibleId || '').trim()
  const manualRespName = String(bodyForSave.manualResponsibleName || '').trim()
  const savedResponsibleName = String(assignmentForSave.responsible?.name || '').trim()
  const effectiveResponsibleName = savedResponsibleName || manualRespName || null

  const toSave: QuadrantSave = {
    code: bodyForSave.code || '',
    eventId: normalizeEventId(bodyForSave.eventId),
    eventName: bodyForSave.eventName || '',
    location: bodyForSave.location || '',
    meetingPoint: bodyForSave.meetingPoint || '',
    startDate: bodyForSave.startDate || '',
    startTime: bodyForSave.startTime || '00:00',
    endDate: bodyForSave.endDate || '',
    endTime: bodyForSave.endTime || '00:00',
    arrivalTime: bodyForSave.arrivalTime || null,
    department: deptNorm,
    status: 'draft',
    numDrivers: Number(bodyForSave.numDrivers || 0),
    totalWorkers: Number(bodyForSave.totalWorkers || 0),
    numPax: bodyForSave.numPax ?? null,
    service: bodyForSave.service || null,
    ln: String(bodyRecord.ln || bodyRecord.LN || bodyRecord.lineOfBusiness || '').trim() || null,
    phaseType: bodyForSave.phaseType || (deptNorm === 'cuina' ? 'event' : null),
    phaseLabel: bodyForSave.phaseLabel || (deptNorm === 'cuina' ? 'Event' : null),
    phaseDate: bodyForSave.phaseDate || null,

    responsableName: effectiveResponsibleName,
    responsable: effectiveResponsibleName
      ? {
          ...(manualRespId ? { id: manualRespId } : {}),
          name: effectiveResponsibleName,
          meetingPoint: bodyForSave.meetingPoint || '',
        }
      : null,
    ...(manualRespId ? { responsableId: manualRespId } : {}),

    conductors: (assignmentForSave.drivers || []).map((d) => ({
      name: d.name,
      meetingPoint: d.meetingPoint || bodyForSave.meetingPoint || '',
      plate: d.plate || '',
      vehicleType: d.vehicleType || '',
      isJamonero: d.isJamonero === true,
    })),

    treballadors: [...internalWorkerLines, ...externalWorkerLines],

    needsReview: !!metaForSave.needsReview,
    violations: metaForSave.violations || [],
    attentionNotes: metaForSave.notes || [],
    updatedAt: new Date().toISOString(),
    timetables: normalizedTimetables,
    vestimentModel:
      deptNorm === 'serveis'
        ? (typeof bodyForSave.vestimentModel === 'string'
            ? bodyForSave.vestimentModel.trim() || null
            : null)
        : null,
    autoProposal: {
      createdAt: new Date().toISOString(),
      generationMode: mode,
      responsibleName: assignmentForSave.responsible?.name || null,
      driverNames: (assignmentForSave.drivers || [])
        .map((d) => String(d?.name || '').trim())
        .filter((n) => Boolean(n) && n !== 'Extra'),
      staffNames: (assignmentForSave.staff || [])
        .map((s) => String(s?.name || '').trim())
        .filter((n) => Boolean(n) && n !== 'Extra'),
      needsReview: !!metaForSave.needsReview,
      violations: metaForSave.violations || [],
      notes: metaForSave.notes || [],
    },
  }

  if (!toSave.responsableName && manualRespName) {
    toSave.responsableName = manualRespName
    toSave.responsable = {
      ...(manualRespId ? { id: manualRespId } : {}),
      name: manualRespName,
      meetingPoint: bodyForSave.meetingPoint || '',
    }
    if (manualRespId) {
      toSave.responsableId = manualRespId
    }
  }

  if (Array.isArray(bodyForSave.groups)) {
    if (deptNorm === 'serveis') {
      const normPerson = (value?: string | null) =>
        String(value || '')
          .trim()
          .toLowerCase()

      toSave.groups = bodyForSave.groups.map((g, groupIndex) => {
        const groupDriverId = String(g.driverId || '').trim()
        const groupResponsibleId = String(g.responsibleId || '').trim()
        const wantsResponsible = g.wantsResponsible === true
        const resolvedResponsibleId = wantsResponsible
          ? groupResponsibleId ||
            (groupDriverId && manualRespId && groupDriverId === manualRespId ? groupDriverId : '') ||
            (groupIndex === 0 && manualRespId ? manualRespId : '')
          : ''

        const resolvedResponsibleName = wantsResponsible
          ? String(g.responsibleName || '').trim() ||
            savedResponsibleName ||
            manualRespName ||
            (resolvedResponsibleId && groupDriverId === resolvedResponsibleId
              ? String(g.driverName || '').trim()
              : '') ||
            null
          : null

        return {
          wantsResponsible,
          id: g.id || null,
          serviceDate: g.serviceDate || null,
          dateLabel: g.dateLabel || null,
          meetingPoint: g.meetingPoint || '',
          startTime: g.startTime || '',
          endTime: g.endTime || '',
          workers: Number(g.workers || 0),
          jamoneros: Number(g.jamoneros || bodyForSave.jamoneroCount || 0),
          drivers: Number(g.drivers || 0),
          needsDriver: !!g.needsDriver,
          driverId: g.driverId || null,
          driverName:
            g.driverName ||
            assignmentForSave.drivers?.find((driver, idx) =>
              idx < Math.max(1, Number(g.drivers || 0))
            )?.name ||
            null,
          ...(Array.isArray(g.manualWorkers) ? { manualWorkers: g.manualWorkers } : {}),
          ...(Array.isArray(g.roleLines) ? { roleLines: g.roleLines } : {}),
          responsibleId: resolvedResponsibleId || null,
          responsibleName: resolvedResponsibleName,
        }
      })

      const driverIdByName = new Map<string, string>()
      toSave.groups?.forEach((group) => {
        const id = String(group.driverId || '').trim()
        const name = String(group.driverName || '').trim()
        if (id && name) driverIdByName.set(normPerson(name), id)
      })
      toSave.conductors = toSave.conductors.map((driver) => {
        const id = driverIdByName.get(normPerson(driver.name))
        return id ? { ...driver, id } : driver
      })
    } else {
      const normalizePerson = (value?: string | null) =>
        (value || '').toString().trim().toLowerCase()
      const remainingDrivers = [...(assignmentForSave.drivers || [])]
      let workerIdx = 0
      const usedNames = new Set<string>()
      const computedGroups = (bodyForSave.groups as CuinaGroup[]).map((group) => {
        const needsDriver = group.needsDriver ?? Number(group.drivers || 0) > 0
        const driversNeeded = needsDriver ? Math.max(1, Number(group.drivers || 0)) : 0
        const preferredDriverName = normalizePerson(group.driverName)
        const driversSlice: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }> = []

        if (driversNeeded > 0 && preferredDriverName) {
          const preferredIdx = remainingDrivers.findIndex(
            (driver) => normalizePerson(driver?.name) === preferredDriverName
          )
          if (preferredIdx >= 0) {
            const [preferred] = remainingDrivers.splice(preferredIdx, 1)
            if (preferred) driversSlice.push(preferred)
          }
        }

        while (driversSlice.length < driversNeeded && remainingDrivers.length > 0) {
          const next = remainingDrivers.shift()
          if (!next) break
          driversSlice.push(next)
        }

        const wantsResponsible = group.wantsResponsible !== false
        let responsibleName = wantsResponsible ? group.responsibleName || null : null
        if (responsibleName && usedNames.has(responsibleName.toLowerCase().trim())) {
          responsibleName = null
        }

        const workersNeeded = Math.max(
          Number(group.workers || 0) - driversNeeded,
          0
        )

        const workersSlice: Array<{ name: string; meetingPoint?: string }> = []
        while (workersSlice.length < workersNeeded) {
          const next = (assignmentForSave.staff || [])[workerIdx]
          workerIdx += 1
          if (!next) {
            workersSlice.push({ name: 'Extra' })
            continue
          }
          const normName = next.name?.toLowerCase().trim()
          if (normName && usedNames.has(normName)) continue
          workersSlice.push(next)
        }

        if (wantsResponsible && !responsibleName && deptNorm === 'cuina') {
          // A cuina prioritzem conductor com a responsable quan el grup en necessita.
          const candidateDriver = driversSlice.find((p) => p?.name && p.name !== 'Extra')
          const candidateWorker = workersSlice.find((p) => p?.name && p.name !== 'Extra')
          responsibleName = candidateDriver?.name || candidateWorker?.name || null
        }

        const groupNames = [
          responsibleName,
          ...driversSlice.map((d) => d?.name),
          ...workersSlice.map((w) => w?.name),
        ]
          .filter((name) => typeof name === 'string' && name && name !== 'Extra')
          .map((name) => (name as string).toLowerCase().trim())
        groupNames.forEach((name) => usedNames.add(name))

        return { ...group, needsDriver, drivers: driversNeeded, wantsResponsible, responsibleName }
      })

      toSave.groups = computedGroups

      if (deptNorm === 'cuina' && !toSave.responsableName) {
        const firstGroupResponsible = computedGroups.find(
          (group) => group.wantsResponsible !== false && group.responsibleName
        )
        const fallbackName =
          firstGroupResponsible?.responsibleName ||
          [...toSave.conductors, ...toSave.treballadors].find((person) => {
            if (!person?.name || person.name === 'Extra') return false
            if ('isExternal' in person && person.isExternal === true) return false
            return !String(person.name).toLowerCase().startsWith('ett')
          })?.name ||
          null

        if (fallbackName) {
          toSave.responsableName = fallbackName
          toSave.responsable = {
            name: fallbackName,
            meetingPoint:
              firstGroupResponsible?.meetingPoint ||
              computedGroups[0]?.meetingPoint ||
              bodyForSave.meetingPoint ||
              '',
          }
        }
      }

      if (deptNorm === 'cuina') {
        const responsibleNames = new Set<string>()
        const topResponsible = normalizePerson(toSave.responsableName)
        if (topResponsible) responsibleNames.add(topResponsible)
        computedGroups.forEach((group) => {
          if (group.wantsResponsible === false) return
          const groupResponsible = normalizePerson(group.responsibleName)
          if (groupResponsible) responsibleNames.add(groupResponsible)
        })

        const driverNames = new Set<string>()
        toSave.conductors = toSave.conductors.filter((driver) => {
          const normalized = normalizePerson(driver?.name)
          if (!normalized) return false
          if (driverNames.has(normalized)) return false
          driverNames.add(normalized)
          return true
        })

        const reservedNames = new Set<string>([...responsibleNames, ...driverNames])
        const uniqueWorkers: Array<{ name: string; meetingPoint: string }> = []
        const seenWorkers = new Set<string>()
        staffClean.forEach((worker) => {
          const normalized = normalizePerson(worker.name)
          if (!normalized || normalized === 'extra') return
          if (reservedNames.has(normalized)) return
          if (seenWorkers.has(normalized)) return
          seenWorkers.add(normalized)
          uniqueWorkers.push({
            name: worker.name,
            meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
          })
        })

        const targetWorkers = Math.max(
          Number(bodyForSave.totalWorkers || 0) -
            Number(bodyForSave.numDrivers || 0) -
            responsibleNames.size,
          0
        )

        while (uniqueWorkers.length < targetWorkers) {
          uniqueWorkers.push({
            name: 'Extra',
            meetingPoint: bodyForSave.meetingPoint || '',
          })
        }

        toSave.treballadors = [...uniqueWorkers, ...externalWorkerLines]
      }
    }
  }

  if (bodyForSave.cuinaGroupCount) {
    toSave.cuinaGroupCount = Number(bodyForSave.cuinaGroupCount)
  }

  if (deptNorm === 'cuina') {
    toSave.totalWorkers = Math.max(Number(toSave.totalWorkers || 0), 0)
  } else {
    toSave.totalWorkers =
      Math.max(Number(toSave.totalWorkers || 0), 0) + Number(externalWorkersRaw.length || 0)
  }

  return { toSave }
}
