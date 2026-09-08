import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  getOpsiaPctAnualDoc,
  syncOpsiaPctAnual,
} from '@/lib/costServeis/opsiaPctAnual'

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

function parseYear(req: NextRequest): number | null {
  const year = Number(req.nextUrl.searchParams.get('year'))
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null
  return year
}

/** GET ?year=2026&grup=calblay */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView =
    (await canViewUiPath({ user: auth.user, path: VIEW_PATH })) ||
    (await canViewUiPath({ user: auth.user, path: MODULE_PATH }))
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const year = parseYear(req)
  if (year == null) {
    return NextResponse.json({ error: 'Cal year vàlid' }, { status: 400 })
  }
  const grup = String(req.nextUrl.searchParams.get('grup') || 'calblay')
  const { configured } = getOpsiaFinanceConfig()
  const doc = await getOpsiaPctAnualDoc(year, grup)
  return NextResponse.json({ year: doc, configured })
}

/** POST ?year=2026&grup=calblay — sync % anual Gestió. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canSyncOpsia(auth.user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const year = parseYear(req)
  if (year == null) {
    return NextResponse.json({ error: 'Cal year vàlid' }, { status: 400 })
  }
  const grup = String(req.nextUrl.searchParams.get('grup') || 'calblay')

  const { configured } = getOpsiaFinanceConfig()
  if (!configured) {
    return NextResponse.json(
      {
        error:
          'OpsiaFinance no configurat (OPSIA_FINANCE_BASE_URL / API_KEY)',
      },
      { status: 503 }
    )
  }

  try {
    const doc = await syncOpsiaPctAnual({
      year,
      grup,
      userId: auth.user.id,
    })
    return NextResponse.json({ year: doc, configured: true })
  } catch (err) {
    console.error('[cost-serveis/opsia/pct-anual POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error sync' },
      { status: 502 }
    )
  }
}
