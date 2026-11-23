import 'server-only'

import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  CALENDAR_LN_PERMISSION,
  calendarLnScopeIdsForPermission,
  isCalendarLnAllowed,
} from '@/lib/calendar/calendarLn'

export type CalendarLnMutation = keyof typeof CALENDAR_LN_PERMISSION

export async function allowedCalendarLnsForUser(
  userId: string,
  mutation: CalendarLnMutation
): Promise<string[] | null> {
  const snap = await firestoreAdmin.collection('user_access_assignments').doc(userId).get()
  const assignment = snap.exists ? snap.data() || null : null
  return calendarLnScopeIdsForPermission(assignment, CALENDAR_LN_PERMISSION[mutation])
}

export async function isCalendarLnMutationAllowed(params: {
  userId: string
  mutation: CalendarLnMutation
  ln: unknown
}): Promise<boolean> {
  const allowedLns = await allowedCalendarLnsForUser(params.userId, params.mutation)
  return isCalendarLnAllowed(params.ln, allowedLns)
}
