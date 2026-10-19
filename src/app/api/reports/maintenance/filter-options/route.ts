import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { buildMaintenanceOverview } from '@/lib/informes/buildMaintenanceOverview'
import { canViewReportsDomain, reportsDomainForbiddenResponse } from '@/lib/server/reportsApiAuth'
import { canViewUiPath } from '@/lib/server/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Opcions de filtre per a la pestanya «A mida» (mateixa finestra que el període KPI per defecte). */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') === 'cuina_central' ? 'cuina_central' : undefined
  const canViewGeneralReports = await canViewReportsDomain(auth.user, 'maintenance')
  const canViewCuinaCentralReports = scope
    ? await canViewUiPath({ user: auth.user, path: '/menu/cuina-central/informes' })
    : false

  if (!canViewGeneralReports && !canViewCuinaCentralReports) {
    return reportsDomainForbiddenResponse()
  }

  try {
    const days = Math.min(365, Math.max(7, Number(searchParams.get('days')) || 90))
    const overview = await buildMaintenanceOverview({ mode: 'rolling', days, scope })
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
