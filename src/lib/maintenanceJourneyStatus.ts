export type JourneyStatus =
  | 'nou'
  | 'assignat'
  | 'reassignat'
  | 'en_curs'
  | 'espera'
  | 'fet'
  | 'no_fet'
  | 'validat'

export type StatusHistoryEntry = {
  status?: string
  at?: number
  byId?: string
  byName?: string
  startTime?: string | null
  endTime?: string | null
  note?: string | null
}

const SEGMENT_STATUSES = new Set<JourneyStatus>(['en_curs', 'espera'])

export const needsClosePreviousSegment = (status: JourneyStatus) => SEGMENT_STATUSES.has(status)

export const needsStartOnNextStatus = (status: JourneyStatus) =>
  status === 'en_curs' || status === 'espera'

export const needsCompletionPhotos = (status: JourneyStatus) => status === 'fet'

export const needsNoteOnNextStatus = (status: JourneyStatus) =>
  status === 'no_fet' || status === 'espera'

function normalizeJourneyTimeValue(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = raw.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return raw
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return raw
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function deriveJourneyTransitionTimes(params: {
  currentStatus: JourneyStatus
  nextStatus?: JourneyStatus
  startTime?: string | null
  endTime?: string | null
  previousSegmentEndTime?: string | null
  hasStaleOpenSegment?: boolean
}) {
  const effectiveStatus = params.nextStatus || params.currentStatus
  const closesPrevious = needsClosePreviousSegment(params.currentStatus)
  const opensNextSegment = needsStartOnNextStatus(effectiveStatus)
  const terminalEnd =
    effectiveStatus === 'fet' || effectiveStatus === 'no_fet' || effectiveStatus === 'validat'

  const closeSegmentEndTime =
    closesPrevious || terminalEnd
      ? params.hasStaleOpenSegment
        ? normalizeJourneyTimeValue(params.previousSegmentEndTime)
        : normalizeJourneyTimeValue(params.endTime)
      : undefined

  const sameDayStatusHandoff =
    !params.hasStaleOpenSegment &&
    closesPrevious &&
    opensNextSegment &&
    effectiveStatus !== params.currentStatus

  const newSegmentStartTime =
    opensNextSegment || terminalEnd
      ? sameDayStatusHandoff
        ? closeSegmentEndTime
        : normalizeJourneyTimeValue(params.startTime)
      : undefined

  const newSegmentEndTime =
    effectiveStatus === 'fet'
      ? normalizeJourneyTimeValue(params.endTime)
      : terminalEnd
        ? normalizeJourneyTimeValue(params.endTime)
        : undefined

  return {
    effectiveStatus,
    closesPrevious,
    opensNextSegment,
    terminalEnd,
    closeSegmentEndTime,
    newSegmentStartTime,
    newSegmentEndTime,
    sameDayStatusHandoff,
  }
}

export function getOpenSegmentStart(
  history: StatusHistoryEntry[] | undefined,
  status: JourneyStatus
): string {
  if (!Array.isArray(history)) return ''
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    if (String(entry?.status || '') !== status) continue
    const start = String(entry?.startTime || '').trim()
    const end = String(entry?.endTime || '').trim()
    if (start && !end) return start
  }
  return ''
}

export function applyStatusHistoryUpdate(
  history: StatusHistoryEntry[],
  currentStatus: JourneyStatus,
  nextStatus: JourneyStatus,
  params: {
    closeSegmentEndTime?: string | null
    newSegmentStartTime?: string | null
    newSegmentEndTime?: string | null
    note?: string | null
    userId: string
    userName: string
  }
): StatusHistoryEntry[] {
  const next = history.map((entry) => ({ ...entry }))

  const closeEnd = String(params.closeSegmentEndTime || '').trim()
  if (closeEnd && needsClosePreviousSegment(currentStatus)) {
    for (let i = next.length - 1; i >= 0; i--) {
      const entry = next[i]
      if (String(entry?.status || '') !== currentStatus) continue
      const start = String(entry?.startTime || '').trim()
      const end = String(entry?.endTime || '').trim()
      if (start && !end) {
        next[i] = { ...entry, endTime: closeEnd }
        break
      }
    }
  }

  const newStart = String(params.newSegmentStartTime || '').trim()
  const newEnd = String(params.newSegmentEndTime || '').trim()

  const entry: StatusHistoryEntry = {
    status: nextStatus,
    at: Date.now(),
    byId: params.userId,
    byName: params.userName,
    note: String(params.note || '').trim() || null,
    startTime: null,
    endTime: null,
  }

  if (needsStartOnNextStatus(nextStatus)) {
    entry.startTime = newStart || null
  } else if (nextStatus === 'fet' || nextStatus === 'no_fet' || nextStatus === 'validat') {
    entry.startTime = newStart || null
    entry.endTime = newEnd || closeEnd || null
  }

  next.push(entry)
  return next
}

export function validateJourneyStatusPayload(params: {
  currentStatus: JourneyStatus
  nextStatus: JourneyStatus
  closeSegmentEndTime?: string
  newSegmentStartTime?: string
  newSegmentEndTime?: string
  note?: string
  completionImageCount?: number
}): string | null {
  const { currentStatus, nextStatus } = params
  const closeEnd = String(params.closeSegmentEndTime || '').trim()
  const newStart = String(params.newSegmentStartTime || '').trim()
  const newEnd = String(params.newSegmentEndTime || '').trim()
  const note = String(params.note || '').trim()

  const needsEnd = needsClosePreviousSegment(currentStatus) || nextStatus === 'fet' || nextStatus === 'no_fet' || nextStatus === 'validat'
  const needsStart =
    needsStartOnNextStatus(nextStatus) || nextStatus === 'fet' || nextStatus === 'no_fet' || nextStatus === 'validat'

  if (needsEnd && !closeEnd && !newEnd) {
    return 'Omple hora fi.'
  }

  if (needsStart && !newStart) {
    return 'Omple hora inici.'
  }

  if (nextStatus === 'fet') {
    const count = params.completionImageCount ?? 0
    if (count < 1) {
      return "Cal adjuntar com a minim una foto o fitxer nou de l'operari per marcar Fet."
    }
  }

  if ((nextStatus === 'no_fet' || nextStatus === 'espera') && !note) {
    return nextStatus === 'espera'
      ? "Cal indicar el motiu de l'espera en observacions."
      : 'Cal indicar el motiu en observacions.'
  }

  return null
}
