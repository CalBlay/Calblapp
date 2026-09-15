import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import { listOpsiaTransfersMonthDocs } from '@/lib/costServeis/opsiaTransfers'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const VIEW_PATH = `${MODULE_PATH}/costos-estructura`

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView =
    (await canViewUiPath({ user: auth.user, path: VIEW_PATH })) ||
    (await canViewUiPath({ user: auth.user, path: MODULE_PATH }))
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const fromYm = String(req.nextUrl.searchParams.get('from') || '').trim()
  const toYm = String(req.nextUrl.searchParams.get('to') || '').trim()
  if (!/^\d{4}-\d{2}$/.test(fromYm) || !/^\d{4}-\d{2}$/.test(toYm)) {
    return NextResponse.json({ error: 'Cal from i to en format YYYY-MM' }, { status: 400 })
  }

  try {
    const months = await listOpsiaTransfersMonthDocs({ fromYm, toYm })
    const { configured } = getOpsiaFinanceConfig()
    return NextResponse.json({ from: fromYm, to: toYm, months, configured })
  } catch (error) {
    console.error('[cost-serveis/opsia/transfers/months]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    )
  }
}
