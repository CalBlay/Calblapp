import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { buildTransportsOverview } from '@/lib/informes/buildTransportsOverview'
import { canViewReportsDomain, reportsDomainForbiddenResponse } from '@/lib/server/reportsApiAuth'

export const runtime = 'nodejs'

function parseYear(value: string | null): number {
  const year = Number(value)
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return new Date().getFullYear()
  }
  return year
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  if (!(await canViewReportsDomain(auth.user, 'transports'))) {
    return reportsDomainForbiddenResponse()
  }

  try {
    const { searchParams } = new URL(req.url)
    const year = parseYear(searchParams.get('year'))
    const payload = await buildTransportsOverview({
      year,
      mode: 'year',
    })

    return NextResponse.json(
      { filterOptions: payload.filterOptions },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: unknown) {
    console.error('[api/reports/transports/filter-options]', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No s han pogut carregar els filtres',
      },
      { status: 500 }
    )
  }
}
