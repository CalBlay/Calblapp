import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { buildArticleMachineMetrics } from '@/lib/cuina-central/analytics'
import { loadAllModelStates } from '@/lib/cuina-central/ml/loadModelStates'
import { mapLog, mapRate } from '@/lib/cuina-central/firestoreMappers'
import { cleanText } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res

  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const [logsSnap, ratesSnap, modelStates] = await Promise.all([
    db.collection(CUINA_CENTRAL_COLLECTIONS.productionLogs).orderBy('endedAt', 'desc').limit(2000).get(),
    db.collection(CUINA_CENTRAL_COLLECTIONS.machineArticleRates).get(),
    loadAllModelStates(db),
  ])

  let logs = logsSnap.docs.map((doc) => mapLog(doc.id, doc.data() as Record<string, unknown>))
  if (from) logs = logs.filter((l) => l.endedAt >= from)
  if (to) logs = logs.filter((l) => l.endedAt <= `${to}T23:59:59.999Z`)
  const rates = ratesSnap.docs.map((doc) => mapRate(doc.id, doc.data() as Record<string, unknown>))
  const pairMetrics = buildArticleMachineMetrics(logs, rates)

  const byMachine = new Map<
    string,
    { machineId: string; machineName: string; logs: number; minutes: number; qty: number; rejected: number }
  >()
  const byArticle = new Map<
    string,
    { articleId: string; articleName: string; logs: number; minutes: number; qty: number; rejected: number }
  >()
  const byOperator = new Map<
    string,
    { operator: string; logs: number; minutes: number; qty: number }
  >()

  for (const log of logs) {
    const m = byMachine.get(log.machineId) || {
      machineId: log.machineId,
      machineName: log.machineName || log.machineCode,
      logs: 0,
      minutes: 0,
      qty: 0,
      rejected: 0,
    }
    m.logs++
    m.minutes += log.durationMinutes
    m.qty += log.quantityProduced
    m.rejected += log.quantityRejected
    byMachine.set(log.machineId, m)

    const a = byArticle.get(log.articleId) || {
      articleId: log.articleId,
      articleName: log.articleName || log.articleCode,
      logs: 0,
      minutes: 0,
      qty: 0,
      rejected: 0,
    }
    a.logs++
    a.minutes += log.durationMinutes
    a.qty += log.quantityProduced
    a.rejected += log.quantityRejected
    byArticle.set(log.articleId, a)

    const ops = cleanText(log.operatorNames)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const targets = ops.length ? ops : ['(sense operari)']
    for (const op of targets) {
      const o = byOperator.get(op) || { operator: op, logs: 0, minutes: 0, qty: 0 }
      o.logs++
      o.minutes += log.durationMinutes
      o.qty += log.quantityProduced
      byOperator.set(op, o)
    }
  }

  const trend = logs
    .slice(0, 500)
    .reverse()
    .map((log) => ({
      endedAt: log.endedAt,
      articleCode: log.articleCode,
      machineCode: log.machineCode,
      minutesPerUnit:
        log.quantityProduced > 0
          ? Math.round((log.durationMinutes / log.quantityProduced) * 100) / 100
          : null,
      qtyPerHour:
        log.durationMinutes > 0
          ? Math.round((log.quantityProduced / log.durationMinutes) * 60 * 100) / 100
          : null,
    }))

  return NextResponse.json({
    pairMetrics,
    modelStates,
    byMachine: [...byMachine.values()],
    byArticle: [...byArticle.values()],
    byOperator: [...byOperator.values()],
    trend,
    sampleSize: logs.length,
  })
}
