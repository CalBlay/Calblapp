import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import { listAllWarehouseMembers } from '@/lib/eventComanda/warehouseMembers.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const membersByWarehouse = await listAllWarehouseMembers()
  return NextResponse.json({ membersByWarehouse })
}
