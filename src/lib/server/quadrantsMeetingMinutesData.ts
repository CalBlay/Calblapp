import type { IncidentMeetingAttendee } from '@/lib/incidentMeetingSession'
import {
  mergeQuadrantsMeetingAttendees,
  resolveQuadrantsMeetingAttendees,
} from '@/lib/quadrantsMeetingAttendees'
import { loadAllAppUsers } from '@/lib/server/incidentMeetingUsers'

export async function loadDefaultQuadrantsMeetingAttendees(): Promise<IncidentMeetingAttendee[]> {
  const users = await loadAllAppUsers(true)
  return resolveQuadrantsMeetingAttendees(users)
}

export async function refreshQuadrantsMeetingAttendees(
  saved: IncidentMeetingAttendee[]
): Promise<IncidentMeetingAttendee[]> {
  const core = await loadDefaultQuadrantsMeetingAttendees()
  return mergeQuadrantsMeetingAttendees(saved, core)
}
