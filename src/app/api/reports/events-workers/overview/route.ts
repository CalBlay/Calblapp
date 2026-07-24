export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { buildEventsWorkersOverview } from '@/lib/informes/buildEventsWorkersOverview'

const MAX_RANGE_DAYS = 366

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('dateFrom')?.trim() ?? ''
  const dateTo = searchParams.get('dateTo')?.trim() ?? ''

  const department = searchParams.get('department')?.trim() ?? ''
  const workerName = searchParams.get('workerName')?.trim() ?? ''
  const role = searchParams.get('role')?.trim() ?? ''
  const onlyClosed = searchParams.get('onlyClosed') === '1'

  const filters =
    department || workerName || role || onlyClosed
      ? {
          department: department || undefined,
          workerName: workerName || undefined,
          role: role || undefined,
          onlyClosed,
        }
      : undefined

  const hasExplicitRange = Boolean(dateFrom && dateTo)

  if (hasExplicitRange) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ error: 'Dates no vàlides.' }, { status: 400 })
    }
    const from = new Date(`${dateFrom}T00:00:00`)
    const to = new Date(`${dateTo}T00:00:00`)
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
      return NextResponse.json({ error: 'Rang de dates no vàlid.' }, { status: 400 })
    }
    const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: 'El rang màxim és d’un any.' }, { status: 400 })
    }

    const payload = await buildEventsWorkersOverview({
      db,
      window: {
        mode: 'range',
        dateFrom,
        dateTo,
      },
      filters,
    })
    return NextResponse.json(payload)
  }

  const days = Math.min(365, Math.max(7, Number(searchParams.get('days')) || 30))
  const payload = await buildEventsWorkersOverview({
    db,
    window: {
      mode: 'rolling',
      days,
    },
    filters,
  })
  return NextResponse.json(payload)
}
