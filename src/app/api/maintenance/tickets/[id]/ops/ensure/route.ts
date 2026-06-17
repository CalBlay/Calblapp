import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  canManageMaintenanceTicketChatMembers,
  ensureMaintenanceTicketOpsChannel,
} from '@/lib/messaging/maintenanceTicketOps.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export const dynamic = 'force-dynamic'

export async function POST(
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
  const actor = accessUserFromAuth(auth.user)

  try {
    const result = await ensureMaintenanceTicketOpsChannel({ ticket, actor })
    const canManageChatMembers = await canManageMaintenanceTicketChatMembers({
      ticket,
      channel: { responsibleUserId: result.managerUserId },
      userId: actor.id,
      role: String(actor.role || ''),
      user: actor,
    })

    return NextResponse.json({
      ok: true,
      channelId: result.channelId,
      canManageChatMembers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error sincronitzant el xat.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
