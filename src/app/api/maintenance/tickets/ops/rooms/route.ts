import { NextResponse } from 'next/server'
import { listAllMaintenanceTicketOpsRooms } from '@/lib/messaging/maintenanceTicketOps.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const requestedType = new URL(request.url).searchParams.get('ticketType')
  const ticketType = requestedType === 'deco' ? 'deco' : 'maquinaria'

  const rooms = await listAllMaintenanceTicketOpsRooms({
    user: accessUserFromAuth(auth.user),
    ticketType,
  })

  return NextResponse.json({ rooms })
}
