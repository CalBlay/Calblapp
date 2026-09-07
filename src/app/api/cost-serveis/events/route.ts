import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { buildCostServeisListItems } from '@/lib/costServeis/buildListItems'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView = await canViewUiPath({ user: auth.user, path: MODULE_PATH })
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = String(searchParams.get('from') || '').slice(0, 10)
  const to = String(searchParams.get('to') || '').slice(0, 10)
  if (!isIsoDateDayParam(from) || !isIsoDateDayParam(to)) {
    return NextResponse.json(
      { error: 'Paràmetres from/to obligatoris (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const result = await buildCostServeisListItems(from, to)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cost-serveis/events]', err)
    return NextResponse.json({ error: 'Error carregant events' }, { status: 500 })
  }
}
