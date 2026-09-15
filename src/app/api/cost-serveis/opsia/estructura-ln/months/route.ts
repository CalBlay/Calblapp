import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  flattenEstructuraLnMonthsToRows,
  listOpsiaEstructuraLnMonthDocs,
} from '@/lib/costServeis/opsiaEstructuraLn'
import { listOpsiaFixedLnMonthDocs } from '@/lib/costServeis/opsiaFixedLn'
import { listOpsiaTransfersMonthDocs } from '@/lib/costServeis/opsiaTransfers'
import { calculateIndirectPersonnelPool } from '@/lib/costServeis/fixedCostMath'
import { sumOperationalTransfersForLn } from '@/lib/costServeis/transferCostMath'

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
    const [docs, fixedDocs, transferDocs] = await Promise.all([
      listOpsiaEstructuraLnMonthDocs({ fromYm: from, toYm: to }),
      listOpsiaFixedLnMonthDocs({ fromYm: from, toYm: to }),
      listOpsiaTransfersMonthDocs({ fromYm: from, toYm: to }),
    ])
    const fixedByYm = new Map(fixedDocs.map((doc) => [doc.ym, doc]))
    const transfersByYm = new Map(transferDocs.map((doc) => [doc.ym, doc]))
    const rows = flattenEstructuraLnMonthsToRows(docs).map((row) => {
      const fixedRow = fixedByYm.get(row.ym)?.byLn?.[row.lnCodi]
      const fixedDirecte = fixedRow
        ? Math.max(0, Number(fixedRow.costSalarial) || 0)
        : null
      const operationalDirectTransfers = sumOperationalTransfersForLn(
        transfersByYm.get(row.ym),
        row.lnNom,
        row.lnCodi
      )
      return {
        ...row,
        fixedDirecte,
        operationalDirectTransfers,
        personalIndirecteCalculat: calculateIndirectPersonnelPool({
          personalTotalLn: row.personalTotalLn,
          fixedDirect: fixedDirecte,
          operationalDirectTransfers,
          mode: row.personalIndirecteMode,
          configuredFixed: row.personalIndirecteFixConfigurat,
        }),
      }
    })
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
