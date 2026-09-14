import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { resolveCostDepartmentFilter } from '@/lib/costServeis/access'
import {
  listMonthlyCostIndicators,
  rebuildMonthlyCostIndicators,
} from '@/lib/costServeis/monthlyIndicators'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const CONFIG_PATH = `${MODULE_PATH}/configuracio`
const YM = /^\d{4}-(0[1-9]|1[0-2])$/

function readRange(req: NextRequest) {
  const fromYm = String(req.nextUrl.searchParams.get('from') || '').trim()
  const toYm = String(req.nextUrl.searchParams.get('to') || '').trim()
  return YM.test(fromYm) && YM.test(toYm) && fromYm <= toYm
    ? { fromYm, toYm }
    : null
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView =
    (await canViewUiPath({ user: auth.user, path: CONFIG_PATH })) ||
    (await canViewUiPath({ user: auth.user, path: MODULE_PATH }))
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const range = readRange(req)
  if (!range) {
    return NextResponse.json({ error: 'Cal from i to en format YYYY-MM' }, { status: 400 })
  }
  const department = resolveCostDepartmentFilter({
    role: auth.user.role,
    department: auth.user.department,
    requested: req.nextUrl.searchParams.get('dept'),
  })
  try {
    const rows = await listMonthlyCostIndicators({ ...range, department })
    return NextResponse.json({ ...range, department, rows })
  } catch (error) {
    console.error('[cost-serveis/monthly-indicators GET]', error)
    return NextResponse.json({ error: 'Error carregant les dades mensuals' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: CONFIG_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const range = readRange(req)
  if (!range) {
    return NextResponse.json({ error: 'Cal from i to en format YYYY-MM' }, { status: 400 })
  }
  try {
    const result = await rebuildMonthlyCostIndicators({ ...range, userId: auth.user.id })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cost-serveis/monthly-indicators POST]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error generant les dades mensuals' },
      { status: 500 }
    )
  }
}
