import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeDepartmentLabel } from '@/data/departments'
import { buildIncidentsOverview, normalizeIncidentReportRow } from '@/lib/informes/incidentsOverview'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewReportsDomain, reportsDomainForbiddenResponse } from '@/lib/server/reportsApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 366
const MAX_INCIDENTS = 10_000

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function previousPeriod(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - days + 1)
  return { dateFrom: ymd(previousStart), dateTo: ymd(previousEnd) }
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canViewReportsDomain(auth.user, 'incidents'))) return reportsDomainForbiddenResponse()

  try {
    const { searchParams } = new URL(req.url)
    const dateFrom = String(searchParams.get('dateFrom') || '').trim()
    const dateTo = String(searchParams.get('dateTo') || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ error: 'Cal indicar dateFrom i dateTo.' }, { status: 400 })
    }
    const fromMs = new Date(`${dateFrom}T00:00:00`).getTime()
    const toMs = new Date(`${dateTo}T23:59:59.999`).getTime()
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      return NextResponse.json({ error: 'El període no és vàlid.' }, { status: 400 })
    }
    if (toMs - fromMs > MAX_RANGE_DAYS * 86_400_000) {
      return NextResponse.json({ error: 'El rang màxim és d’un any.' }, { status: 400 })
    }

    const allDepartments = auth.role === 'admin' || auth.role === 'direccio'
    const ownDepartment = String(auth.user.department || '').trim()
    if (!allDepartments && !normalizeDepartmentLabel(ownDepartment)) {
      return NextResponse.json(
        { error: 'El teu usuari no té cap departament assignat.' },
        { status: 403 }
      )
    }

    const previous = previousPeriod(dateFrom, dateTo)
    const snap = await firestoreAdmin
      .collection('incidents')
      .where('createdAt', '>=', new Date(`${previous.dateFrom}T00:00:00`))
      .where('createdAt', '<=', new Date(`${dateTo}T23:59:59.999`))
      .orderBy('createdAt', 'desc')
      .limit(MAX_INCIDENTS)
      .get()
    const incidents = snap.docs.map((doc) =>
      normalizeIncidentReportRow(doc.id, doc.data() as Record<string, unknown>)
    )
    const requestedDepartment = allDepartments
      ? String(searchParams.get('department') || '').trim()
      : ownDepartment

    const overview = buildIncidentsOverview({
      incidents,
      dateFrom,
      dateTo,
      previousDateFrom: previous.dateFrom,
      previousDateTo: previous.dateTo,
      scope: { allDepartments, department: ownDepartment },
      filters: {
        department: requestedDepartment || undefined,
        category: searchParams.get('category') || undefined,
        status: searchParams.get('status') || undefined,
        importance: searchParams.get('importance') || undefined,
      },
    })

    return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error: unknown) {
    console.error('[api/reports/incidents/overview]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut construir l’informe.' },
      { status: 500 }
    )
  }
}
