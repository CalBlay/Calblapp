import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  flattenEstructuraLnMonthsToRows,
  listOpsiaEstructuraLnMonthDocs,
} from '@/lib/costServeis/opsiaEstructuraLn'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const VIEW_PATH = `${MODULE_PATH}/costos-estructura`

/** GET ?from=2026-01&to=2026-12 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView =
    (await canViewUiPath({ user: auth.user, path: VIEW_PATH })) ||
    (await canViewUiPath({ user: auth.user, path: MODULE_PATH }))
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const from = String(req.nextUrl.searchParams.get('from') || '').trim()
  const to = String(req.nextUrl.searchParams.get('to') || '').trim()
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: 'Cal from i to en format YYYY-MM' },
      { status: 400 }
    )
  }

  try {
    const docs = await listOpsiaEstructuraLnMonthDocs({ fromYm: from, toYm: to })
    const rows = flattenEstructuraLnMonthsToRows(docs)
    const { configured } = getOpsiaFinanceConfig()
    return NextResponse.json({
      from,
      to,
      rows,
      months: docs,
      configured,
    })
  } catch (err) {
    console.error('[cost-serveis/opsia/estructura-ln/months]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    )
  }
}
