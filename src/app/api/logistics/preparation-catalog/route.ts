import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { listPreparationWarehousesForUser } from '@/lib/logistics/preparationAccess.server'
import {
  createPreparationCatalogArticle,
  getPreparationForm,
  listPreparationCatalog,
} from '@/lib/logistics/preparationForm.server'
import { isPreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readPurpose(value: unknown) {
  const allowed = new Set([
    'machinery',
    'small_machinery',
    'logistics_pack',
    'pallet_jack',
    'assigned',
  ])
  return allowed.has(String(value))
    ? (value as 'machinery' | 'small_machinery' | 'logistics_pack' | 'pallet_jack' | 'assigned')
    : null
}

async function ensurePreparer(userId: string, role: string, warehouseRaw: string) {
  const warehouse = String(warehouseRaw || '').trim().toUpperCase()
  if (!isPreparationWarehouseCode(warehouse)) return null
  const allowed = await listPreparationWarehousesForUser(userId, role)
  return allowed.includes(warehouse) ? warehouse : null
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const { searchParams } = new URL(req.url)
  const purpose = readPurpose(searchParams.get('purpose'))
  const rowId = String(searchParams.get('rowId') || '').trim()
  const warehouse = await ensurePreparer(
    auth.user.id,
    auth.role,
    searchParams.get('warehouse') || ''
  )
  if (!purpose || !rowId || !warehouse) {
    return NextResponse.json({ error: 'Petició de catàleg no vàlida.' }, { status: 400 })
  }

  try {
    const { interval } = await getPreparationForm(rowId, warehouse)
    const result = await listPreparationCatalog({
      purpose,
      assignedWarehouseCode: warehouse,
      q: searchParams.get('q') || '',
      interval,
      excludeEventRowId: rowId,
      excludeWarehouseCode: warehouse,
    })
    return NextResponse.json({ ok: true, interval, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut carregar el catàleg.' },
      { status: 400 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const body = (await req.json().catch(() => ({}))) as {
    purpose?: string
    name?: string
    stock?: number
    warehouse?: string
  }
  const purpose = readPurpose(body.purpose)
  const warehouse = await ensurePreparer(auth.user.id, auth.role, body.warehouse || '')
  if (!purpose || purpose === 'assigned' || !warehouse) {
    return NextResponse.json({ error: 'No tens permís per crear aquest article.' }, { status: 403 })
  }

  try {
    const article = await createPreparationCatalogArticle({
      purpose,
      name: String(body.name || ''),
      stock: Number(body.stock) || 1,
      userId: auth.user.id,
    })
    return NextResponse.json({ ok: true, article })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut crear l’article.' },
      { status: 400 }
    )
  }
}
