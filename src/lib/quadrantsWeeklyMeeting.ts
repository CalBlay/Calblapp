export const QUADRANTS_MEETING_DECISIONS_COLLECTION =
  'quadrant_weekly_meeting_decisions'
export const QUADRANTS_MEETING_MINUTES_COLLECTION =
  'quadrant_weekly_meeting_sessions'
export const QUADRANTS_MEETING_EVENT_NOTES_COLLECTION =
  'quadrant_weekly_meeting_event_notes'

export type MeetingDepartment = 'logistica' | 'cuina'

export type MeetingDecision = {
  id: string
  eventId: string
  eventCode: string
  eventDay: string
  department: MeetingDepartment
  required: boolean
  arrivalTime: string
  updatedAt: string
  updatedByName: string
}

export type MeetingEventNote = {
  id: string
  eventId: string
  eventCode: string
  eventDay: string
  scheduleNotes: string
  scheduleEntries: MeetingScheduleEntry[]
  updatedAt: string
  updatedByName: string
}

export type MeetingScheduleEntry = {
  id: string
  time: string
  label: string
}

export type WeeklyMeetingRow = {
  key: string
  eventId: string
  eventCode: string
  eventDay: string
  eventName: string
  location: string
  ln: string
  pax: string
  eventSchedule: string
  scheduleNotes: string
  scheduleEntries: MeetingScheduleEntry[]
  scheduleNotesSaved: boolean
  servicesResponsible: string
  servicesTeam: string
  servicesClosing: string
  logistica: { required: boolean; arrivalTime: string; saved: boolean }
  cuina: { required: boolean; arrivalTime: string; saved: boolean }
}

const normalizeEventId = (value: unknown) =>
  String(value || '').trim().split('__')[0].trim()

export function meetingEventKey(eventId: unknown, eventDay: unknown): string {
  return `${normalizeEventId(eventId)}::${String(eventDay || '').slice(0, 10)}`
}

export function meetingDecisionKey(
  eventId: unknown,
  eventDay: unknown,
  department: MeetingDepartment
): string {
  return `${meetingEventKey(eventId, eventDay)}::${department}`
}

export function decisionMap(decisions: MeetingDecision[]) {
  return new Map(
    decisions.map((decision) => [
      meetingDecisionKey(
        decision.eventId,
        decision.eventDay,
        decision.department
      ),
      decision,
    ])
  )
}

function recordDay(record: Record<string, unknown>): string {
  return String(record.phaseDate || record.startDate || '').slice(0, 10)
}

function recordMatchesEvent(
  record: Record<string, unknown>,
  eventId: string,
  eventCode: string,
  eventDay: string
) {
  const sameEvent =
    normalizeEventId(record.eventId) === normalizeEventId(eventId) ||
    (!!eventCode && String(record.code || record.eventCode || '') === eventCode)
  if (!sameEvent) return false
  const start = String(record.startDate || record.phaseDate || '').slice(0, 10)
  const end = String(record.endDate || record.phaseDate || start).slice(0, 10)
  return (!start || start <= eventDay) && (!end || end >= eventDay)
}

export function applyMeetingDecisionsToDashboard<T extends Record<string, unknown>>(
  department: string,
  events: T[],
  quadrants: Record<string, unknown>[],
  decisions: MeetingDecision[]
) {
  if (department !== 'logistica' && department !== 'cuina') {
    return { events, quadrants }
  }

  const relevant = decisions.filter((item) => item.department === department)

  const resolve = (record: Record<string, unknown>, fallbackDay = '') => {
    const eventId = normalizeEventId(record.eventId || record.id)
    const code = String(record.code || record.eventCode || '')
    const day = recordDay(record) || fallbackDay
    return relevant.find((item) =>
      recordMatchesEvent(record, item.eventId, item.eventCode, item.eventDay) &&
      (!day || day === item.eventDay)
    ) || relevant.find((item) =>
      (item.eventId === eventId || (!!code && item.eventCode === code)) &&
      item.eventDay === day
    )
  }

  const visibleEvents = events.flatMap((event) => {
    const day = String(event.day || event.start || '').slice(0, 10)
    const decision = resolve(event, day)
    if (decision?.required === false) return []
    return [{ ...event, ...(decision?.arrivalTime ? { arrivalTime: decision.arrivalTime } : {}) }]
  })

  const visibleQuadrants = quadrants.flatMap((quadrant) => {
    const decision = resolve(quadrant)
    if (decision?.required === false) return []
    const phase = String(quadrant.phaseType || quadrant.phaseLabel || '').toLowerCase()
    const isEventPhase = !phase || phase === 'event'
    return [{
      ...quadrant,
      ...(decision?.arrivalTime && isEventPhase
        ? { arrivalTime: decision.arrivalTime }
        : {}),
    }]
  })

  return { events: visibleEvents, quadrants: visibleQuadrants }
}
