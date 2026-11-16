import type { IncidentMeetingAttendee } from '@/lib/incidentMeetingSession'
import {
  findUserForCoreName,
  foldPersonText,
  mergeMeetingAttendees,
  type AppUserRow,
} from '@/lib/incidentMeetingAttendees'

/** Convocats fixos de la reunió setmanal de Quadrants. */
export const QUADRANTS_MEETING_CORE_NAMES = [
  'Jona',
  'Gaston',
  'David',
  'Frederick Aubert',
  'Soulaimane El Bouzidi',
  'Josep',
  'Jordi',
] as const

export function resolveQuadrantsMeetingAttendees(
  users: AppUserRow[]
): IncidentMeetingAttendee[] {
  const usedIds = new Set<string>()
  return QUADRANTS_MEETING_CORE_NAMES.map((hint) => {
    const match = findUserForCoreName(
      users.filter((user) => !usedIds.has(user.id)),
      hint
    )
    if (match) {
      usedIds.add(match.id)
      return {
        key: `core:${match.id}`,
        userId: match.id,
        name: match.name,
        email: match.email,
        department: match.department || '',
        attendance: null,
        absenceReason: '',
        receiveEmail: true,
      }
    }
    return {
      key: `core:name:${foldPersonText(hint)}`,
      userId: '',
      name: hint,
      email: '',
      department: '',
      attendance: null,
      absenceReason: '',
      receiveEmail: true,
    }
  })
}

export function mergeQuadrantsMeetingAttendees(
  saved: IncidentMeetingAttendee[],
  currentCore: IncidentMeetingAttendee[]
) {
  return mergeMeetingAttendees(saved, currentCore)
}
