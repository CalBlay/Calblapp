import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { buildTransportsOverview } from '@/lib/informes/buildTransportsOverview'

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

  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  try {
    const { searchParams } = new URL(req.url)
    const year = parseYear(searchParams.get('year'))
    const payload = await buildTransportsOverview({
      year,
      month: searchParams.get('month') || undefined,
      plate: searchParams.get('plate') || undefined,
      conductor: searchParams.get('conductor') || undefined,
      vehicleType: searchParams.get('vehicleType') || undefined,
      eventQuery: searchParams.get('eventQuery') || undefined,
      mode:
        searchParams.get('mode') === 'custom'
          ? 'custom'
          : 'year',
    })

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: unknown) {
    console.error('[api/reports/transports/overview]', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No s ha pogut construir l informe',
      },
      { status: 500 }
    )
  }
}
