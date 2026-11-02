import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { listLogisticsPreparationDashboardDetails } from '@/lib/logistics/logisticsLoading.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'direccio', 'cap'] as const

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ALLOWED_ROLES)
  if (forbidden) return forbidden.res
  const body = (await req.json().catch(() => ({}))) as { rowIds?: unknown }
  const rowIds = Array.isArray(body.rowIds)
    ? body.rowIds.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  if (!rowIds.length || rowIds.length > 250) {
    return NextResponse.json({ error: 'Cal indicar entre 1 i 250 línies.' }, { status: 400 })
  }

  try {
    const details = await listLogisticsPreparationDashboardDetails(rowIds)
    return NextResponse.json({ ok: true, details })
  } catch (error) {
    console.error('[logistics/preparation-dashboard-details] POST error', error)
    return NextResponse.json(
      { error: 'No s\'han pogut carregar els detalls de preparació i càrrega.' },
      { status: 500 }
    )
  }
}
