import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { listPreparationWarehousesForUser } from '@/lib/logistics/preparationAccess.server'
import { PREPARATION_WAREHOUSE_LABELS } from '@/lib/logistics/preparationWarehouses'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const denied = requireRoles(auth, ['admin', 'direccio', 'cap', 'treballador'])
  if (denied) return denied.res

  try {
    const scope = new URL(request.url).searchParams.get('scope') === 'deco' ? 'deco' : undefined
    const warehouses = await listPreparationWarehousesForUser(auth.user.id, auth.role, { scope })
    return NextResponse.json({
      ok: true,
      warehouses: warehouses.map((code) => ({
        code,
        label: PREPARATION_WAREHOUSE_LABELS[code],
      })),
    })
  } catch (error) {
    console.error('Error carregant magatzems de preparació:', error)
    return NextResponse.json(
      { ok: false, error: 'No s’han pogut carregar els magatzems de preparació.' },
      { status: 500 }
    )
  }
}
