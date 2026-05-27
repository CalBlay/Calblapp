export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { ROBA_REQUEST_STATUS_LABEL } from '@/app/menu/roba-personal/robaPersonalConstants'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import {
  buildRrhhRobaOverview,
  type BuildRrhhOverviewWindow,
} from '@/lib/informes/buildRrhhRobaOverview'

const MAX_RANGE_MS = 366 * 86_400_000

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  const { searchParams } = new URL(req.url)
  const fromMsRaw = searchParams.get('fromMs')
  const toMsRaw = searchParams.get('toMs')
  const dateFrom = searchParams.get('dateFrom')?.trim() ?? ''
  const dateTo = searchParams.get('dateTo')?.trim() ?? ''

  const department = searchParams.get('department')?.trim() ?? ''
  const status = searchParams.get('status')?.trim() ?? ''
  const statusLabel = searchParams.get('statusLabel')?.trim() ?? ''
  const statusCodes = status
    ? status
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean)
    : []
  const productId = searchParams.get('productId')?.trim() ?? ''
  const productLabel = searchParams.get('productLabel')?.trim() ?? ''

  let window: BuildRrhhOverviewWindow

  if (fromMsRaw != null && fromMsRaw !== '' && toMsRaw != null && toMsRaw !== '') {
    const fromMs = Number(fromMsRaw)
    const toMs = Number(toMsRaw)
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
      return NextResponse.json({ error: 'fromMs i toMs no valids.' }, { status: 400 })
    }
    if (toMs - fromMs > MAX_RANGE_MS) {
      return NextResponse.json({ error: 'El rang maxim es d un any.' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json(
        { error: 'Cal dateFrom i dateTo (YYYY-MM-DD) amb fromMs i toMs.' },
        { status: 400 }
      )
    }
    window = { mode: 'range', fromMs, toMs, dateFrom, dateTo }
  } else {
    const days = Math.min(365, Math.max(7, Number(searchParams.get('days')) || 30))
    window = { mode: 'rolling', days }
  }

  const filters =
    department || status || productId || productLabel
      ? {
          department: department || undefined,
          status: status || undefined,
          statusCodes: statusCodes.length > 0 ? statusCodes : undefined,
          statusLabel: statusLabel || (status ? ROBA_REQUEST_STATUS_LABEL[status] || status : undefined),
          productId: productId || undefined,
          productLabel: productLabel || undefined,
        }
      : undefined

  const payload = await buildRrhhRobaOverview({ db, window, filters })
  return NextResponse.json(payload)
}
