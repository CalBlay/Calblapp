import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { resolveCostDepartmentFilter } from '@/lib/costServeis/access'
import {
  flattenOpsiaMonthsToRows,
  getOpsiaFinanceConfig,
  listOpsiaMonthDocs,
} from '@/lib/costServeis/opsiaFinance'
import type { CostServeisDepartment } from '@/lib/costServeis/types'
import { listOpsiaTransfersMonthDocs } from '@/lib/costServeis/opsiaTransfers'
import { adjustStructureLinesWithTransfers } from '@/lib/costServeis/transferCostMath'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const VIEW_PATH = `${MODULE_PATH}/costos-estructura`

/** GET ?from=2026-01&to=2026-12&dept=logistica|all */
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

  const dept = resolveCostDepartmentFilter({
    role: auth.user.role,
    department: auth.user.department,
    requested: req.nextUrl.searchParams.get('dept'),
  })

  try {
    const [docs, transferDocs] = await Promise.all([
      listOpsiaMonthDocs({ fromYm: from, toYm: to }),
      listOpsiaTransfersMonthDocs({ fromYm: from, toYm: to }),
    ])
    const transferByYm = new Map(transferDocs.map((doc) => [doc.ym, doc]))
    const rowsRaw = flattenOpsiaMonthsToRows(
      docs,
      dept as CostServeisDepartment | 'all'
    )
    const adjustedByKey = new Map<
      string,
      { costPersonal: number; costPersonalGross: number; transferOut: number; transferIn: number }
    >()
    for (const doc of docs) {
      const transferDoc = transferByYm.get(doc.ym)
      if (transferDoc?.estat !== 'CONFIRMAT') continue
      for (const department of ['logistica', 'cuina'] as const) {
        const adjustment = adjustStructureLinesWithTransfers({
          department,
          sourceLines: (doc.departments?.[department]?.lines || []).map((line) => ({
            deptCodi: line.deptCodi,
            deptNom: line.deptNom,
            costPersonal: line.costPersonal,
            pot: line.pot,
          })),
          transfers: transferDoc.lines,
        })
        for (const line of adjustment.lines) {
          adjustedByKey.set(`${doc.ym}|${department}|${line.deptCodi}`, line)
        }
      }
    }
    const rows = rowsRaw.map((row) => {
      const transferDoc = transferByYm.get(row.ym)
      const adjusted = adjustedByKey.get(
        `${row.ym}|${row.calBlayDept}|${row.deptCodi}`
      )
      return {
        ...row,
        ...(adjusted || { costPersonalGross: row.costPersonal }),
        transfersStatus: transferDoc?.estat || 'NO_IMPORTAT',
      }
    })
    const { configured } = getOpsiaFinanceConfig()
    return NextResponse.json({
      from,
      to,
      dept,
      rows,
      months: docs,
      configured,
    })
  } catch (err) {
    console.error('[cost-serveis/opsia/months]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    )
  }
}
