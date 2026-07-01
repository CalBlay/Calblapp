import type { MeetingMinutesFilters } from '@/lib/incidentsMeetingMinutes'

export type MeetingAttendance = 'in_person' | 'online' | 'absent' | null

export type IncidentMeetingAttendee = {
  key: string
  userId: string
  name: string
  email: string
  department?: string
  attendance: MeetingAttendance
  absenceReason?: string
  /** Per defecte true; false = exclòs de la llista i del correu. */
  receiveEmail?: boolean
}

export function isMeetingEmailRecipient(attendee: IncidentMeetingAttendee): boolean {
  return attendee.receiveEmail !== false
}

export function activeMeetingAttendees(attendees: IncidentMeetingAttendee[]): IncidentMeetingAttendee[] {
  return attendees.filter(isMeetingEmailRecipient)
}

export function normalizeMeetingAttendance(item: {
  attendance?: unknown
  attended?: unknown
}): MeetingAttendance {
  const a = item.attendance
  if (a === 'in_person' || a === 'online' || a === 'absent') return a
  if (item.attended === true) return 'in_person'
  if (item.attended === false) return 'absent'
  return null
}

export function attendedFromMeetingAttendance(attendance: MeetingAttendance): boolean | null {
  if (attendance === 'in_person' || attendance === 'online') return true
  if (attendance === 'absent') return false
  return null
}

export type IncidentMeetingSessionStatus = 'draft' | 'finalized'

export type IncidentMeetingSession = {
  id: string
  status: IncidentMeetingSessionStatus
  notes: string
  incidentFilters: MeetingMinutesFilters
  attendees: IncidentMeetingAttendee[]
  createdAt: string
  updatedAt: string
  createdById?: string | null
  createdByName?: string | null
  finalizedAt?: string | null
  finalizedById?: string | null
  finalizedByName?: string | null
  emailSentAt?: string | null
  emailSentById?: string | null
  emailSentByName?: string | null
}

export type IncidentMeetingAttendeeOption = {
  id: string
  name: string
  email: string
  department: string
  role: string
}

export function defaultMeetingIncidentFilters(
  seed?: Partial<MeetingMinutesFilters>
): MeetingMinutesFilters {
  return {
    from: seed?.from,
    to: seed?.to,
    department: seed?.department,
    importance: seed?.importance || 'all',
    categoryLabel: seed?.categoryLabel || 'all',
    status: seed?.status || 'all',
  }
}

/** Firestore no accepta `undefined`; només desem camps definits. */
export function meetingFiltersForFirestore(filters: MeetingMinutesFilters): Record<string, string> {
  const out: Record<string, string> = {
    importance: filters.importance || 'all',
    categoryLabel: filters.categoryLabel || 'all',
    status: filters.status || 'all',
  }
  const from = String(filters.from || '').trim()
  const to = String(filters.to || '').trim()
  const department = String(filters.department || '').trim()
  if (from) out.from = from
  if (to) out.to = to
  if (department) out.department = department
  return out
}

export function meetingAttendeesForFirestore(attendees: IncidentMeetingAttendee[]) {
  return attendees.map((a) => ({
    key: a.key,
    userId: a.userId || '',
    name: a.name,
    email: a.email,
    department: a.department || '',
    attendance: a.attendance,
    attended: attendedFromMeetingAttendance(a.attendance),
    absenceReason: a.absenceReason || '',
    ...(a.receiveEmail === false ? { receiveEmail: false } : {}),
  }))
}

export function serializeMeetingSession(
  id: string,
  data: Record<string, unknown>
): IncidentMeetingSession {
  const status = data.status === 'finalized' ? 'finalized' : 'draft'
  const rawFilters = (data.incidentFilters || {}) as Record<string, unknown>
  const attendees = Array.isArray(data.attendees)
    ? data.attendees
        .map((row) => {
          const item = row as Record<string, unknown>
          const email = String(item.email || '').trim()
          const key = String(item.key || `user:${item.userId || email}`).trim()
          const name = String(item.name || email).trim()
          if (!email.includes('@') && !key.startsWith('core:')) return null
          return {
            key: String(item.key || `user:${item.userId || email}`).trim(),
            userId: String(item.userId || '').trim(),
            name,
            email,
            department: String(item.department || '').trim(),
            attendance: normalizeMeetingAttendance(item),
            absenceReason: String(item.absenceReason || '').trim(),
            receiveEmail: item.receiveEmail === false ? false : true,
          } satisfies IncidentMeetingAttendee
        })
        .filter(Boolean)
    : []

  return {
    id,
    status,
    notes: String(data.notes || ''),
    incidentFilters: defaultMeetingIncidentFilters({
      from: String(rawFilters.from || '').trim() || undefined,
      to: String(rawFilters.to || '').trim() || undefined,
      department: String(rawFilters.department || '').trim() || undefined,
      importance: String(rawFilters.importance || 'all'),
      categoryLabel: String(rawFilters.categoryLabel || 'all'),
      status: (rawFilters.status as MeetingMinutesFilters['status']) || 'all',
    }),
    attendees: attendees as IncidentMeetingAttendee[],
    createdAt: String(data.createdAt || ''),
    updatedAt: String(data.updatedAt || ''),
    createdById: data.createdById ? String(data.createdById) : null,
    createdByName: data.createdByName ? String(data.createdByName) : null,
    finalizedAt: data.finalizedAt ? String(data.finalizedAt) : null,
    finalizedById: data.finalizedById ? String(data.finalizedById) : null,
    finalizedByName: data.finalizedByName ? String(data.finalizedByName) : null,
    emailSentAt: data.emailSentAt ? String(data.emailSentAt) : null,
    emailSentById: data.emailSentById ? String(data.emailSentById) : null,
    emailSentByName: data.emailSentByName ? String(data.emailSentByName) : null,
  }
}
