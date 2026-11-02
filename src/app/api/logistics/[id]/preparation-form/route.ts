import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { listPreparationWarehousesForUser } from '@/lib/logistics/preparationAccess.server'
import {
  getPreparationForm,
  savePreparationForm,
} from '@/lib/logistics/preparationForm.server'
import { isPreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import type { PreparationWarehouseForm } from '@/lib/logistics/prepTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorizeWarehouse(userId: string, role: string, rawWarehouse: string) {
  const warehouse = String(rawWarehouse || '').trim().toUpperCase()
  if (!isPreparationWarehouseCode(warehouse)) {
    return { error: NextResponse.json({ error: 'Magatzem no vàlid.' }, { status: 400 }) }
  }
  const allowed = await listPreparationWarehousesForUser(userId, role)
  if (!allowed.includes(warehouse)) {
    return { error: NextResponse.json({ error: 'No tens permís per aquest magatzem.' }, { status: 403 }) }
  }
  return { warehouse }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const access = await authorizeWarehouse(auth.user.id, auth.role, searchParams.get('warehouse') || '')
  if ('error' in access) return access.error

  try {
    const result = await getPreparationForm(id, access.warehouse)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut carregar la fitxa.' },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    warehouse?: string
    form?: Partial<PreparationWarehouseForm>
  }
  const access = await authorizeWarehouse(auth.user.id, auth.role, body.warehouse || '')
  if ('error' in access) return access.error

  try {
    const result = await savePreparationForm({
      rowId: id,
      warehouseCode: access.warehouse,
      rawForm: body.form || {},
      userId: auth.user.id,
      userName: String(auth.user.name || '').trim(),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut desar la fitxa.' },
      { status: 400 }
    )
  }
}
