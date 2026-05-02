export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { buildRobaInventoryContext } from '@/lib/roba-personal/purchaseDraft'

export async function GET() {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const ctx = await buildRobaInventoryContext()
  return NextResponse.json({
    generatedAt: ctx.generatedAt,
    consumptionWindowDays: ctx.consumptionWindowDays,
    alertsAtOrBelowMin: ctx.alertsAtOrBelowMin,
    rows: ctx.stockRows,
  })
}
