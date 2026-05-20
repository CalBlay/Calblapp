import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { buildDailyDecisionReport } from '@/lib/cuina-central/ml/dailyReport'
import type { DailyDecisionReport } from '@/lib/cuina-central/ml/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res

  const url = new URL(req.url)
  const dateKey =
    url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const build = url.searchParams.get('build') === '1'

  if (build) {
    const report = await buildDailyDecisionReport(db, dateKey)
    return NextResponse.json({ report })
  }

  const doc = await db.collection(CUINA_CENTRAL_COLLECTIONS.dailyReports).doc(dateKey).get()
  if (!doc.exists) {
    const report = await buildDailyDecisionReport(db, dateKey)
    return NextResponse.json({ report, generated: true })
  }

  return NextResponse.json({
    report: { id: doc.id, ...doc.data() } as DailyDecisionReport,
    generated: false,
  })
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const dateKey =
    String(body?.dateKey || '').trim() || new Date().toISOString().slice(0, 10)
  const report = await buildDailyDecisionReport(db, dateKey)
  return NextResponse.json({ ok: true, report })
}
