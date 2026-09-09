import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, type AuthenticatedApiUser } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  getOpsiaEstructuraLnMonthDoc,
  syncOpsiaEstructuraLnMonth,
} from '@/lib/costServeis/opsiaEstructuraLn'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const VIEW_PATH = `${MODULE_PATH}/costos-estructura`
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

function parseYearMonth(req: NextRequest): { year: number; month: number } | null {
  const year = Number(req.nextUrl.searchParams.get('year'))
  const month = Number(req.nextUrl.searchParams.get('month'))
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return null
  }
  return { year, month }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView =
    (await canViewUiPath({ user: auth.user, path: VIEW_PATH })) ||
    (await canViewUiPath({ user: auth.user, path: MODULE_PATH }))
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ym = parseYearMonth(req)
  if (!ym) {
    return NextResponse.json({ error: 'Cal year i month vàlids' }, { status: 400 })
  }

  const { configured } = getOpsiaFinanceConfig()
  const cached = await getOpsiaEstructuraLnMonthDoc(ym.year, ym.month)
  return NextResponse.json({ month: cached, configured })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canSyncOpsia(auth.user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ym = parseYearMonth(req)
  if (!ym) {
    return NextResponse.json({ error: 'Cal year i month vàlids' }, { status: 400 })
  }

  const { configured } = getOpsiaFinanceConfig()
  if (!configured) {
    return NextResponse.json(
      {
        error:
          'OpsiaFinance no configurat (OPSIA_FINANCE_BASE_URL / OPSIA_FINANCE_API_KEY o OPSIA_EXTERNAL_API_KEY)',
      },
      { status: 503 }
    )
  }

  try {
    const doc = await syncOpsiaEstructuraLnMonth({
      ...ym,
      userId: auth.user.id,
    })
    return NextResponse.json({ month: doc, configured: true })
  } catch (err) {
    console.error('[cost-serveis/opsia/estructura-ln/sync POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error sync' },
      { status: 502 }
    )
  }
}
