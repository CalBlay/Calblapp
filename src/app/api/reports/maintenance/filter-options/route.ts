import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { buildMaintenanceOverview } from '@/lib/informes/buildMaintenanceOverview'
import { canViewUiPath } from '@/lib/server/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Opcions de filtre per a la pestanya «A mida» (mateixa finestra que el període KPI per defecte). */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const requester = {
    id: auth.user.id,
    role: auth.user.role ?? undefined,
    department: auth.user.department ?? undefined,
    canRespondSurveys: Boolean(auth.user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(auth.user.isDepartmentRobaLead),
    robaLinkedPersonnelId: auth.user.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof auth.user.opsProjectsConfigurable === 'boolean'
        ? auth.user.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(auth.user.isTransportLead),
  }

  const [canViewMaintenanceReports, canViewReportsModule] = await Promise.all([
    canViewUiPath({ user: requester, path: '/menu/manteniment/informes' }),
    canViewUiPath({ user: requester, path: '/menu/reports' }),
  ])

  if (!canViewMaintenanceReports && !canViewReportsModule) {
    return NextResponse.json({ error: 'No tens permisos per veure aquests informes.' }, { status: 403 })
  }

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
