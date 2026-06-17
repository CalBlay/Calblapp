import { NextResponse } from 'next/server'
import { listAllMaintenanceTicketOpsRooms } from '@/lib/messaging/maintenanceTicketOps.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const rooms = await listAllMaintenanceTicketOpsRooms({
    user: accessUserFromAuth(auth.user),
  })

  return NextResponse.json({ rooms })
}
