export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { buildRobaInventoryContext } from '@/lib/roba-personal/purchaseDraft'

const STOCK_OVERVIEW_CACHE_MS = 30_000

let cachedOverview:
  | {
      expiresAt: number
      payload: {
        generatedAt: string
        consumptionWindowDays: number
        alertsAtOrBelowMin: number
        rows: Awaited<ReturnType<typeof buildRobaInventoryContext>>['stockRows']
      }
    }
  | null = null

export async function GET() {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.estoc)
  if (!auth.ok) return auth.res

  if (cachedOverview && cachedOverview.expiresAt > Date.now()) {
    return NextResponse.json(cachedOverview.payload)
  }

  const ctx = await buildRobaInventoryContext()
  const payload = {
    generatedAt: ctx.generatedAt,
    consumptionWindowDays: ctx.consumptionWindowDays,
    alertsAtOrBelowMin: ctx.alertsAtOrBelowMin,
    rows: ctx.stockRows,
  }
  cachedOverview = {
    expiresAt: Date.now() + STOCK_OVERVIEW_CACHE_MS,
    payload,
  }
  return NextResponse.json(payload)
}
