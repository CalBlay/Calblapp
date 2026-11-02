import { NextResponse } from 'next/server'
import { listPreparationWarehousesForUser } from '@/lib/logistics/preparationAccess.server'
import { isPreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { getPreparationOpsRoom } from '@/lib/messaging/preparationOps.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const { id } = await params
  const warehouse = String(new URL(req.url).searchParams.get('warehouse') || '').toUpperCase()
  if (!isPreparationWarehouseCode(warehouse)) {
    return NextResponse.json({ error: 'Magatzem no vàlid.' }, { status: 400 })
  }
  const allowed = await listPreparationWarehousesForUser(auth.user.id, auth.role)
  if (!allowed.includes(warehouse)) {
    return NextResponse.json({ error: 'No tens permís per aquest magatzem.' }, { status: 403 })
  }

  try {
    const room = await getPreparationOpsRoom({ rowId: id, warehouseCode: warehouse, userId: auth.user.id })
    return NextResponse.json({ rooms: [room] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut carregar el xat.' },
      { status: 400 }
    )
  }
}
