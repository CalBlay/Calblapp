import { collectQuadrantLinePersonnel } from '@/lib/quadrantLinePersonnel'

type JsonRecord = Record<string, unknown>

const normalizePhase = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

const normalizeEventId = (value: unknown) =>
  String(value || '').trim().split('__')[0].trim()

export function matchesWeeklyMeetingQuadrantEvent(
  quadrant: Record<string, unknown>,
  eventId: string,
  eventCode: string
): boolean {
  const quadrantId = normalizeEventId(quadrant.eventId)
  const quadrantCode = String(quadrant.code || quadrant.eventCode || '')
  return (
    quadrantId === normalizeEventId(eventId) ||
    (!!eventCode && quadrantCode === eventCode)
  )
}

/**
 * Comprova si un document de quadrant pertany a la fila (esdeveniment + dia)
 * que s'està decidint a la reunió setmanal.
 */
export function matchesWeeklyMeetingQuadrantDay(
  quadrant: Record<string, unknown>,
  eventId: string,
  eventCode: string,
  eventDay: string
): boolean {
  if (!matchesWeeklyMeetingQuadrantEvent(quadrant, eventId, eventCode)) return false

  const start = String(quadrant.startDate || quadrant.phaseDate || '').slice(0, 10)
  const end = String(quadrant.endDate || quadrant.phaseDate || start).slice(0, 10)
  return (!start || start <= eventDay) && (!end || end >= eventDay)
}

const meetingDateLabel = (value: unknown) => {
  const iso = String(value || '').slice(0, 10)
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}

const meetingTime = (value: unknown) => {
  const time = String(value || '').trim().slice(0, 5)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : ''
}

export function buildWeeklyMeetingServicesSetup(
  quadrants: Record<string, unknown>[]
): string {
  const rows = new Map<string, { key: string; label: string; names: Set<string> }>()
  quadrants.forEach((quadrant) => {
    const phase = normalizePhase(
      quadrant.phaseType || quadrant.phaseLabel || quadrant.id
    )
    if (!phase.includes('muntatge') && !phase.includes('montatge')) return

    const day = String(quadrant.phaseDate || quadrant.startDate || '').slice(0, 10)
    if (!day) return
    const start = meetingTime(quadrant.startTime)
    const end = meetingTime(quadrant.endTime)
    const hours = start && end ? `${start}–${end}` : start || end
    const key = `${day}|${start}|${end}`
    const current = rows.get(key) || {
      key,
      label: `${meetingDateLabel(day)}${hours ? ` · ${hours}` : ''}`,
      names: new Set<string>(),
    }
    collectQuadrantLinePersonnel(quadrant).forEach((person) => {
      if (person.name) current.names.add(person.name)
    })
    rows.set(key, current)
  })

  return Array.from(rows.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => {
      const names = Array.from(row.names).sort((a, b) => a.localeCompare(b, 'ca'))
      return `${row.label}${names.length ? ` · ${names.join(', ')}` : ''}`
    })
    .join('\n')
}

export function isWeeklyMeetingEventPhase(
  quadrant: Record<string, unknown>
): boolean {
  const phase = normalizePhase(quadrant.phaseType || quadrant.phaseLabel)
  return !phase || phase === 'event' || phase.includes('esdeveniment')
}

const withArrivalTime = (value: unknown, arrivalTime: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return { ...(value as JsonRecord), arrivalTime }
}

const updateArray = (value: unknown, arrivalTime: string): unknown =>
  Array.isArray(value)
    ? value.map((entry) => withArrivalTime(entry, arrivalTime))
    : value

const updateWorkerDetails = (value: unknown, arrivalTime: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, entry]) => [
      key,
      withArrivalTime(entry, arrivalTime),
    ])
  )
}

/**
 * Propaga l'hora acordada a Reunió setmanal a tots els camps des d'on
 * les diferents pantalles de Logística poden reconstruir l'hora d'arribada.
 */
export function buildWeeklyMeetingArrivalPatch(input: {
  raw: Record<string, unknown>
  required: boolean
  arrivalTime: string
  updatedAt: string
}): Record<string, unknown> {
  const { raw, required, arrivalTime, updatedAt } = input
  const patch: Record<string, unknown> = {
    weeklyMeetingRequired: required,
    weeklyMeetingUpdatedAt: updatedAt,
  }
  if (!required) return patch

  patch.arrivalTime = arrivalTime

  if (raw.responsable) patch.responsable = withArrivalTime(raw.responsable, arrivalTime)
  for (const field of [
    'responsables',
    'conductors',
    'treballadors',
    'roleLines',
    'manualWorkers',
    'vehicles',
    'vehicleAssignments',
  ]) {
    if (Array.isArray(raw[field])) patch[field] = updateArray(raw[field], arrivalTime)
  }
  if (raw.workerDetails && typeof raw.workerDetails === 'object') {
    patch.workerDetails = updateWorkerDetails(raw.workerDetails, arrivalTime)
  }

  if (Array.isArray(raw.groups)) {
    patch.groups = raw.groups.map((group) => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return group
      const value = group as JsonRecord
      return {
        ...value,
        arrivalTime,
        ...(Array.isArray(value.roleLines)
          ? { roleLines: updateArray(value.roleLines, arrivalTime) }
          : {}),
        ...(Array.isArray(value.manualWorkers)
          ? { manualWorkers: updateArray(value.manualWorkers, arrivalTime) }
          : {}),
        ...(Array.isArray(value.vehicles)
          ? { vehicles: updateArray(value.vehicles, arrivalTime) }
          : {}),
        ...(Array.isArray(value.vehicleAssignments)
          ? { vehicleAssignments: updateArray(value.vehicleAssignments, arrivalTime) }
          : {}),
        ...(value.workerDetails && typeof value.workerDetails === 'object'
          ? { workerDetails: updateWorkerDetails(value.workerDetails, arrivalTime) }
          : {}),
      }
    })
  }

  return patch
}
