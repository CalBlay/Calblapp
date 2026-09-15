import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, type AuthenticatedApiUser } from '@/lib/server/apiAuth'
import { canEditUiPath } from '@/lib/server/permissions'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import { syncOpsiaTransfersMonth } from '@/lib/costServeis/opsiaTransfers'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const EDIT_PATHS = [
  `${MODULE_PATH}/configuracio`,
  `${MODULE_PATH}/edicio`,
  `${MODULE_PATH}/costos-estructura`,
]

async function canSyncOpsia(user: AuthenticatedApiUser) {
  for (const path of EDIT_PATHS) {
    if (await canEditUiPath({ user, path })) return true
  }
  return false
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canSyncOpsia(auth.user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const year = Number(req.nextUrl.searchParams.get('year'))
  const month = Number(req.nextUrl.searchParams.get('month'))
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ error: 'Cal year i month vàlids' }, { status: 400 })
  }
  if (!getOpsiaFinanceConfig().configured) {
    return NextResponse.json({ error: 'OpsiaFinance no està configurat' }, { status: 503 })
  }

  try {
    const doc = await syncOpsiaTransfersMonth({ year, month, userId: auth.user.id })
    return NextResponse.json({ month: doc, configured: true })
  } catch (error) {
    console.error('[cost-serveis/opsia/transfers/sync]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error de sincronització' },
      { status: 502 }
    )
  }
}
