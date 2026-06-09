import { NextResponse } from 'next/server'
import { resolveCoreMeetingAttendees } from '@/lib/incidentMeetingAttendees'
import { requireIncidentsMeetingMinutes } from '@/lib/server/incidentsApiAuth'
import { loadAllAppUsers, loadAllAppUsersWithEmail } from '@/lib/server/incidentMeetingUsers'

export async function GET() {
  try {
    const auth = await requireIncidentsMeetingMinutes()
    if (!auth.ok) return auth.res

    const users = await loadAllAppUsers(true)
    const coreAttendees = resolveCoreMeetingAttendees(users)
    const guestUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department || '',
      role: '',
    }))

    return NextResponse.json({ coreAttendees, guestUsers }, { status: 200 })
  } catch (e) {
    console.error('[incidents/meeting-minutes/attendees GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
