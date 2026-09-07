import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import {
  ensureOpsiaMonth,
  getOpsiaFinanceConfig,
  getOpsiaMonthDoc,
  syncOpsiaEstructuraMonth,
} from '@/lib/costServeis/opsiaFinance'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const VIEW_PATH = `${MODULE_PATH}/costos-estructura`
const EDIT_PATHS = [
  `${MODULE_PATH}/configuracio`,
  `${MODULE_PATH}/edicio`,
  `${MODULE_PATH}/costos-estructura`,
]

async function canSyncOpsia(user: {
  id: string
  role?: string | null
  department?: string | null
}) {
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

/** GET: cache del mes (sync lazy si falta o ?refresh=1). */
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
    return NextResponse.json(
      { error: 'Cal year i month vàlids' },
      { status: 400 }
    )
  }

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const { configured } = getOpsiaFinanceConfig()

  try {
    if (refresh) {
      if (!(await canSyncOpsia(auth.user))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (!configured) {
        return NextResponse.json(
          { error: 'OpsiaFinance no configurat (OPSIA_FINANCE_BASE_URL / API_KEY)' },
          { status: 503 }
        )
      }
      const doc = await ensureOpsiaMonth({
        ...ym,
        refresh: true,
        userId: auth.user.id,
      })
      return NextResponse.json({ month: doc, configured })
    }

    const cached = await getOpsiaMonthDoc(ym.year, ym.month)
    if (cached?.departments?.logistica && cached?.departments?.cuina) {
      return NextResponse.json({ month: cached, configured })
    }

    if (!configured) {
      return NextResponse.json({
        month: cached,
        configured: false,
        warning: 'OpsiaFinance no configurat',
      })
    }

    const doc = await ensureOpsiaMonth({ ...ym, userId: auth.user.id })
    return NextResponse.json({ month: doc, configured })
  } catch (err) {
    console.error('[cost-serveis/opsia/sync GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error sync' },
      { status: 502 }
    )
  }
}

/** POST: força sync Logística + Cuina des d’OpsiaFinance. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canSyncOpsia(auth.user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ym = parseYearMonth(req)
  if (!ym) {
    return NextResponse.json(
      { error: 'Cal year i month vàlids' },
      { status: 400 }
    )
  }

  const { configured } = getOpsiaFinanceConfig()
  if (!configured) {
    return NextResponse.json(
      { error: 'OpsiaFinance no configurat (OPSIA_FINANCE_BASE_URL / API_KEY)' },
      { status: 503 }
    )
  }

  try {
    const doc = await syncOpsiaEstructuraMonth({
      ...ym,
      userId: auth.user.id,
    })
    return NextResponse.json({ month: doc, configured: true })
  } catch (err) {
    console.error('[cost-serveis/opsia/sync POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error sync' },
      { status: 502 }
    )
  }
}
