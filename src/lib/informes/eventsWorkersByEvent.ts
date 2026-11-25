import type { EventsWorkersEntryRow } from './eventsWorkersOverview'
import { hasEttWorkerMarker } from '@/lib/quadrantExternalWorkers'

export type EventsWorkersEventDepartment = {
  department: string
  rows: EventsWorkersEventPersonRow[]
  ettRows: EventsWorkersEventPersonRow[]
  workersCount: number
  ettCount: number
  closedCount: number
}

export type EventsWorkersEventPersonRow = EventsWorkersEntryRow & {
  roles: string[]
  periodActualHours: number
}

export type EventsWorkersEventGroup = {
  key: string
  eventId: string
  eventCode: string
  eventName: string
  eventDate: string
  location: string
  departments: EventsWorkersEventDepartment[]
  workersCount: number
  ettCount: number
  closedCount: number
}

const normalize = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

function eventKey(entry: EventsWorkersEntryRow) {
  return (
    normalize(entry.eventId) ||
    [entry.eventDate, entry.eventCode, entry.eventName].map(normalize).join('|')
  )
}

const ROLE_ORDER = ['responsable', 'conductor', 'treballador']

function clockMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function workedHours(startTime: string, endTime: string) {
  const start = clockMinutes(startTime)
  const end = clockMinutes(endTime)
  if (start == null || end == null) return 0
  return ((end >= start ? end : end + 24 * 60) - start) / 60
}

function effectiveStartTime(row: Pick<EventsWorkersEntryRow, 'actualStartTime' | 'plannedStartTime'>) {
  return row.actualStartTime || row.plannedStartTime
}

function mergeDepartmentRows(rows: EventsWorkersEntryRow[]): EventsWorkersEventPersonRow[] {
  const byWorker = new Map<string, EventsWorkersEventPersonRow>()

  rows.forEach((row, index) => {
    const key = row.isEtt
      ? `ett:${normalize(row.workerId) || `${normalize(row.ettProviderName)}:${index}`}`
      : normalize(row.workerName)
    const current = byWorker.get(key)
    if (!current) {
      const next = { ...row, roles: [row.role], periodActualHours: 0 }
      if (effectiveStartTime(next) && next.realEndTime) {
        next.actualHours = workedHours(effectiveStartTime(next), next.realEndTime)
      }
      byWorker.set(key, next)
      return
    }

    if (!current.roles.includes(row.role)) current.roles.push(row.role)
    const currentStart = clockMinutes(effectiveStartTime(current))
    const nextStart = clockMinutes(effectiveStartTime(row))
    if (
      effectiveStartTime(row) &&
      (currentStart == null || (nextStart != null && nextStart < currentStart))
    ) {
      current.plannedStartTime = row.plannedStartTime
      current.actualStartTime = row.actualStartTime
    }
    if (!current.realEndTime && row.realEndTime) current.realEndTime = row.realEndTime
    if (row.actualHours > current.actualHours) {
      current.actualHours = row.actualHours
      if (row.realEndTime) current.realEndTime = row.realEndTime
    }
    current.isResponsible = current.isResponsible || row.isResponsible
    current.leftEarly = current.leftEarly || row.leftEarly
    current.lateArrival = current.lateArrival || row.lateArrival
    if (row.wasCorrected) {
      current.wasCorrected = true
      current.correctionReason = row.correctionReason || current.correctionReason
      current.closingChangedAt = row.closingChangedAt || current.closingChangedAt
    }
    current.roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
    if (effectiveStartTime(current) && current.realEndTime) {
      current.actualHours = workedHours(effectiveStartTime(current), current.realEndTime)
    }
  })

  return Array.from(byWorker.values()).sort((a, b) => {
    if (effectiveStartTime(a) !== effectiveStartTime(b)) {
      return effectiveStartTime(a).localeCompare(effectiveStartTime(b))
    }
    return a.workerName.localeCompare(b.workerName, 'ca')
  })
}

/**
 * Vista operativa de l'informe: esdeveniment -> departament -> persones.
 * S'exclouen els no-shows perquè l'informe demana el personal que ha anat a treballar.
 * `realEndTime` es conserva sense cap fallback perquè és l'hora oficial introduïda
 * al tancament operatiu; una cadena buida vol dir que el servei encara no s'ha tancat.
 */
export function groupEventsWorkersByEvent(
  entries: EventsWorkersEntryRow[]
): EventsWorkersEventGroup[] {
  const events = new Map<
    string,
    {
      sample: EventsWorkersEntryRow
      departments: Map<string, { label: string; rows: EventsWorkersEntryRow[] }>
    }
  >()

  entries.forEach((entry) => {
    if (entry.noShow) return
    const normalizedEntry =
      entry.isEtt || hasEttWorkerMarker(entry.workerName)
        ? { ...entry, isEtt: true }
        : entry
    const key = eventKey(normalizedEntry)
    const event = events.get(key) ?? {
      sample: normalizedEntry,
      departments: new Map<string, { label: string; rows: EventsWorkersEntryRow[] }>(),
    }
    const departmentKey = normalize(normalizedEntry.department) || 'sense-departament'
    const department = event.departments.get(departmentKey) ?? {
      label: normalizedEntry.department || 'Sense departament',
      rows: [],
    }
    department.rows.push(normalizedEntry)
    event.departments.set(departmentKey, department)
    events.set(key, event)
  })

  const groupedEvents = Array.from(events.entries())
    .map(([key, event]) => {
      const departments = Array.from(event.departments.values())
        .map(({ label, rows }) => {
          const sortedRows = mergeDepartmentRows(rows.filter((row) => !row.isEtt))
          const ettRows = mergeDepartmentRows(rows.filter((row) => row.isEtt)).map(
            (row, index) => ({
              ...row,
              workerName: `ETT ${index + 1}${row.ettProviderName ? ` · ${row.ettProviderName}` : ''}`,
            })
          )
          return {
            department: label,
            rows: sortedRows,
            ettRows,
            workersCount: sortedRows.length,
            ettCount: ettRows.length,
            closedCount: [...sortedRows, ...ettRows].filter((row) => Boolean(row.realEndTime)).length,
          }
        })
        .sort((a, b) => a.department.localeCompare(b.department, 'ca'))

      const rows = departments.flatMap((department) => [
        ...department.rows,
        ...department.ettRows,
      ])
      const sample = event.sample
      return {
        key,
        eventId: sample.eventId,
        eventCode: sample.eventCode,
        eventName: sample.eventName,
        eventDate: sample.eventDate,
        location: sample.location,
        departments,
        workersCount: departments.reduce((sum, department) => sum + department.workersCount, 0),
        ettCount: departments.reduce((sum, department) => sum + department.ettCount, 0),
        closedCount: rows.filter((row) => Boolean(row.realEndTime)).length,
      }
    })
    .sort((a, b) => {
      if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate)
      return a.eventName.localeCompare(b.eventName, 'ca')
    })

  const totalHoursByWorker = new Map<string, number>()
  groupedEvents.forEach((event) => {
    event.departments.forEach((department) => {
      department.rows.forEach((row) => {
        if (!row.realEndTime) return
        const key = normalize(row.workerName)
        totalHoursByWorker.set(key, (totalHoursByWorker.get(key) ?? 0) + row.actualHours)
      })
    })
  })
  groupedEvents.forEach((event) => {
    event.departments.forEach((department) => {
      department.rows.forEach((row) => {
        row.periodActualHours = totalHoursByWorker.get(normalize(row.workerName)) ?? 0
      })
    })
  })

  return groupedEvents
}
