import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { listMaintenanceTicketOpsRooms } from '@/lib/messaging/maintenanceTicketOps.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await params
  const ticketId = String(id || '').trim()
  if (!ticketId) {
    return NextResponse.json({ error: 'Ticket id required' }, { status: 400 })
  }

  const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get()
  if (!ticketSnap.exists) {
    return NextResponse.json({ error: 'Ticket no trobat.' }, { status: 404 })
  }

  const ticket = { id: ticketSnap.id, ...(ticketSnap.data() as Record<string, unknown>) }
  const rooms = await listMaintenanceTicketOpsRooms({
    ticket,
    user: accessUserFromAuth(auth.user),
  })

  return NextResponse.json({ rooms })
}
