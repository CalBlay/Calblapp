import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { buildMaintenanceOverview } from '@/lib/informes/buildMaintenanceOverview'
import { normalizeMaintenanceOverview } from '@/lib/informes/normalizeMaintenanceOverview'
import { canViewUiPath } from '@/lib/server/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RANGE_MS = 366 * 86_400_000

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
    const mode = searchParams.get('mode')

    if (mode === 'custom') {
      const dateFrom = searchParams.get('dateFrom')?.trim() || ''
      const dateTo = searchParams.get('dateTo')?.trim() || ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return NextResponse.json(
          { error: 'Cal dateFrom i dateTo (YYYY-MM-DD) per a l informe a mida.' },
          { status: 400 }
        )
      }
      const fromMs = new Date(dateFrom).getTime()
      const toMs = new Date(dateTo).getTime()
      if (toMs < fromMs) {
        return NextResponse.json({ error: 'dateTo ha de ser posterior a dateFrom.' }, { status: 400 })
      }
      if (toMs - fromMs > MAX_RANGE_MS) {
        return NextResponse.json({ error: 'El rang màxim és d un any.' }, { status: 400 })
      }

      const payload = await buildMaintenanceOverview({
        mode: 'custom',
        dateFrom,
        dateTo,
        status: searchParams.get('status') || undefined,
        priority: searchParams.get('priority') || undefined,
        center: searchParams.get('center') || undefined,
        location: searchParams.get('location') || undefined,
        zone: searchParams.get('zone') || undefined,
        ticketType: searchParams.get('ticketType') || undefined,
        interventionType: searchParams.get('interventionType') || undefined,
        assigneeId: searchParams.get('assigneeId') || searchParams.get('operatorId') || undefined,
        operatorId: searchParams.get('operatorId') || searchParams.get('assigneeId') || undefined,
      })
      return NextResponse.json(normalizeMaintenanceOverview(payload), {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }

    if (mode === 'range') {
      const dateFrom = searchParams.get('dateFrom')?.trim() || ''
      const dateTo = searchParams.get('dateTo')?.trim() || ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return NextResponse.json({ error: 'Cal dateFrom i dateTo (YYYY-MM-DD).' }, { status: 400 })
      }
      const payload = await buildMaintenanceOverview({ mode: 'range', dateFrom, dateTo })
      return NextResponse.json(normalizeMaintenanceOverview(payload), {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }

    const days = Math.min(365, Math.max(7, Number(searchParams.get('days')) || 30))
    const payload = await buildMaintenanceOverview({ mode: 'rolling', days })
    return NextResponse.json(normalizeMaintenanceOverview(payload), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: unknown) {
    console.error('[api/reports/maintenance/overview]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s ha pogut construir l informe' },
      { status: 500 }
    )
  }
}
