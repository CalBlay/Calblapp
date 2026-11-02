import { NextResponse } from 'next/server'
import { listPreparationWarehousesForUser } from '@/lib/logistics/preparationAccess.server'
import { isPreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { ensurePreparationOpsChannel } from '@/lib/messaging/preparationOps.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { warehouse?: string }
  const warehouse = String(body.warehouse || '').toUpperCase()
  if (!isPreparationWarehouseCode(warehouse)) {
    return NextResponse.json({ error: 'Magatzem no vàlid.' }, { status: 400 })
  }
  const allowed = await listPreparationWarehousesForUser(auth.user.id, auth.role)
  if (!allowed.includes(warehouse)) {
    return NextResponse.json({ error: 'No tens permís per aquest magatzem.' }, { status: 403 })
  }

  try {
    const result = await ensurePreparationOpsChannel({
      rowId: id,
      warehouseCode: warehouse,
      actor: { id: auth.user.id, name: auth.user.name },
    })
    return NextResponse.json({ ok: true, ...result, canManageChatMembers: false })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut obrir el xat.' },
      { status: 400 }
    )
  }
}
