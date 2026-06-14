import { NextResponse } from 'next/server'
import { listEventOpsRooms } from '@/lib/messaging/eventOps.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

function accessUserFromSession(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean
  isTransportLead?: boolean
}) {
  return {
    id: user.id,
    role: user.role,
    department: user.department,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof user.opsProjectsConfigurable === 'boolean'
        ? user.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(user.isTransportLead),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const rooms = await listEventOpsRooms({
    eventId,
    user: accessUserFromSession(auth.user),
  })

  return NextResponse.json({ rooms })
}
