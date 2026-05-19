import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { buildMaintenanceOverview } from '@/lib/informes/buildMaintenanceOverview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Opcions de filtre per a la pestanya «A mida» (mateixa finestra que el període KPI per defecte). */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  try {
    const { searchParams } = new URL(req.url)
    const days = Math.min(365, Math.max(7, Number(searchParams.get('days')) || 90))
    const overview = await buildMaintenanceOverview({ mode: 'rolling', days })
    return NextResponse.json(
      { filterOptions: overview.filterOptions },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: unknown) {
    console.error('[api/reports/maintenance/filter-options]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error carregant filtres' },
      { status: 500 }
    )
  }
}
