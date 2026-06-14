import { NextResponse } from 'next/server'
import { listEventOpsRooms } from '@/lib/messaging/eventOps.server'
import { eventComandaAccessUserFromSession } from '@/lib/eventComanda/eventComandaApiAuth'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

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
    user: eventComandaAccessUserFromSession(auth.user),
  })

  return NextResponse.json({ rooms })
}
