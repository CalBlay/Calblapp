type JsonRecord = Record<string, unknown>

const normalizePhase = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

const normalizeEventId = (value: unknown) =>
  String(value || '').trim().split('__')[0].trim()

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
  const quadrantId = normalizeEventId(quadrant.eventId)
  const quadrantCode = String(quadrant.code || quadrant.eventCode || '')
  const sameEvent =
    quadrantId === normalizeEventId(eventId) ||
    (!!eventCode && quadrantCode === eventCode)
  if (!sameEvent) return false

  const start = String(quadrant.startDate || quadrant.phaseDate || '').slice(0, 10)
  const end = String(quadrant.endDate || quadrant.phaseDate || start).slice(0, 10)
  return (!start || start <= eventDay) && (!end || end >= eventDay)
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
