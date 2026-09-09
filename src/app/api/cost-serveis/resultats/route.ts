import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { buildCostServeisListItems } from '@/lib/costServeis/buildListItems'
import { allocateResultatsFixedCosts } from '@/lib/costServeis/resultatsFixedCosts'
import type { ResultatsCostItem } from '@/lib/costServeis/resultatsAggregate'
import {
  groupByLocation,
  groupByMonth,
  groupByServiceType,
  summarizeResultats,
  toResultatsItemRow,
} from '@/lib/costServeis/resultatsAggregate'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'

function fullMonthRange(from: string, to: string) {
  const [toYear, toMonth] = to.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate()
  return {
    from: `${from.slice(0, 7)}-01`,
    to: `${to.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  }
}

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
    // Calcular sempre contra tots els events dels mesos complets evita que la
    // quota d'un event canviï quan l'usuari filtra només alguns dies.
    const monthRange = fullMonthRange(from, to)
    const { items: monthlyItems } = await buildCostServeisListItems(
      monthRange.from,
      monthRange.to
    )
    const fixed = await allocateResultatsFixedCosts({
      monthlyItems,
      fromYm: monthRange.from.slice(0, 7),
      toYm: monthRange.to.slice(0, 7),
    })
    const items = monthlyItems
      .filter((item) => item.eventDate >= from && item.eventDate <= to)
      .map((item) => ({
        ...item,
        ...(fixed.byEventId.get(item.eventId) || {
          fixedDirect: 0,
          fixedIndirect: 0,
          fixedDirectNormalized: 0,
          fixedIndirectNormalized: 0,
          purchasePct: 0,
          managementPct: 0,
          theoreticalPurchaseCost: 0,
          theoreticalManagementCost: 0,
          pctSource: 'none' as const,
        }),
      })) satisfies ResultatsCostItem[]
    return NextResponse.json({
      from,
      to,
      summary: summarizeResultats(items),
      items: items.map(toResultatsItemRow),
      byServiceType: groupByServiceType(items),
      byLocation: groupByLocation(items),
      byMonth: groupByMonth(items),
      fixedCostAudit: fixed.audit,
      fixedCostCoverage: fixed.coverage,
    })
  } catch (err) {
    console.error('[cost-serveis/resultats]', err)
    return NextResponse.json({ error: 'Error carregant resultats' }, { status: 500 })
  }
}
