import { NextResponse } from 'next/server'
import { listWarehouseIdsForUser } from '@/lib/eventComanda/warehouseMembers.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const warehouseIds = await listWarehouseIdsForUser(auth.user.id)
  return NextResponse.json({ warehouseIds })
}
