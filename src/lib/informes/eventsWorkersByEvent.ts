import type { EventsWorkersEntryRow } from './eventsWorkersOverview'
import { hasEttWorkerMarker } from '@/lib/quadrantExternalWorkers'

export type EventsWorkersEventDepartment = {
  department: string
  rows: EventsWorkersEventPersonRow[]
  workersCount: number
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

function mergeDepartmentRows(rows: EventsWorkersEntryRow[]): EventsWorkersEventPersonRow[] {
  const byWorker = new Map<string, EventsWorkersEventPersonRow>()

  rows.forEach((row) => {
    const key = normalize(row.workerName)
    const current = byWorker.get(key)
    if (!current) {
      byWorker.set(key, { ...row, roles: [row.role], periodActualHours: 0 })
      return
    }

    if (!current.roles.includes(row.role)) current.roles.push(row.role)
    const currentStart = clockMinutes(current.plannedStartTime)
    const nextStart = clockMinutes(row.plannedStartTime)
    if (
      row.plannedStartTime &&
      (currentStart == null || (nextStart != null && nextStart < currentStart))
    ) {
      current.plannedStartTime = row.plannedStartTime
    }
    if (!current.realEndTime && row.realEndTime) current.realEndTime = row.realEndTime
    if (row.actualHours > current.actualHours) {
      current.actualHours = row.actualHours
      if (row.realEndTime) current.realEndTime = row.realEndTime
    }
    current.isResponsible = current.isResponsible || row.isResponsible
    current.leftEarly = current.leftEarly || row.leftEarly
    current.roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
    if (current.plannedStartTime && current.realEndTime) {
      current.actualHours = workedHours(current.plannedStartTime, current.realEndTime)
    }
  })

  return Array.from(byWorker.values()).sort((a, b) => {
    if (a.plannedStartTime !== b.plannedStartTime) {
      return a.plannedStartTime.localeCompare(b.plannedStartTime)
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
    if (entry.noShow || entry.isEtt || hasEttWorkerMarker(entry.workerName)) return
    const key = eventKey(entry)
    const event = events.get(key) ?? {
      sample: entry,
      departments: new Map<string, { label: string; rows: EventsWorkersEntryRow[] }>(),
    }
    const departmentKey = normalize(entry.department) || 'sense-departament'
    const department = event.departments.get(departmentKey) ?? {
      label: entry.department || 'Sense departament',
      rows: [],
    }
    department.rows.push(entry)
    event.departments.set(departmentKey, department)
    events.set(key, event)
  })

  const groupedEvents = Array.from(events.entries())
    .map(([key, event]) => {
      const departments = Array.from(event.departments.values())
        .map(({ label, rows }) => {
          const sortedRows = mergeDepartmentRows(rows)
          return {
            department: label,
            rows: sortedRows,
            workersCount: sortedRows.length,
            closedCount: sortedRows.filter((row) => Boolean(row.realEndTime)).length,
          }
        })
        .sort((a, b) => a.department.localeCompare(b.department, 'ca'))

      const rows = departments.flatMap((department) => department.rows)
      const sample = event.sample
      return {
        key,
        eventId: sample.eventId,
        eventCode: sample.eventCode,
        eventName: sample.eventName,
        eventDate: sample.eventDate,
        location: sample.location,
        departments,
        workersCount: new Set(rows.map((row) => normalize(row.workerName))).size,
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
