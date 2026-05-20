import type { Firestore } from 'firebase-admin/firestore'
import { CUINA_CENTRAL_COLLECTIONS } from '../collections'
import { mapLog } from '../firestoreMappers'
import { ML_CONFIG, dateKeyFromIso } from './constants'
import type { DailyDecisionReport, DailyDeviationRow, ModelPairState } from './types'

function mapModelState(id: string, data: Record<string, unknown>): ModelPairState {
  return {
    id,
    articleId: String(data.articleId || ''),
    articleCode: String(data.articleCode || ''),
    articleName: String(data.articleName || ''),
    machineId: String(data.machineId || ''),
    machineCode: String(data.machineCode || ''),
    machineName: String(data.machineName || ''),
    unit: String(data.unit || 'kg'),
    theoreticalQtyPerHour:
      data.theoreticalQtyPerHour == null ? null : Number(data.theoreticalQtyPerHour),
    predictedMinutesPerUnit:
      data.predictedMinutesPerUnit == null ? null : Number(data.predictedMinutesPerUnit),
    predictedQtyPerHour:
      data.predictedQtyPerHour == null ? null : Number(data.predictedQtyPerHour),
    efficiencyRatio: data.efficiencyRatio == null ? null : Number(data.efficiencyRatio),
    allTime: (data.allTime as ModelPairState['allTime']) || {
      sampleCount: 0,
      meanMinutesPerUnit: null,
      medianMinutesPerUnit: null,
      meanQtyPerHour: null,
      p90MinutesPerUnit: null,
    },
    last30d: (data.last30d as ModelPairState['last30d']) || {
      sampleCount: 0,
      meanMinutesPerUnit: null,
      medianMinutesPerUnit: null,
      meanQtyPerHour: null,
      p90MinutesPerUnit: null,
    },
    last7d: (data.last7d as ModelPairState['last7d']) || {
      sampleCount: 0,
      meanMinutesPerUnit: null,
      medianMinutesPerUnit: null,
      meanQtyPerHour: null,
      p90MinutesPerUnit: null,
    },
    recentMinutesPerUnit: [],
    confidence: (data.confidence as ModelPairState['confidence']) || 'low',
    lastSampleAt: data.lastSampleAt == null ? null : String(data.lastSampleAt),
    updatedAt: Number(data.updatedAt) || 0,
  }
}

export async function buildDailyDecisionReport(
  db: Firestore,
  dateKey: string
): Promise<DailyDecisionReport> {
  const logsSnap = await db
    .collection(CUINA_CENTRAL_COLLECTIONS.productionLogs)
    .orderBy('endedAt', 'desc')
    .limit(3000)
    .get()

  const logs = logsSnap.docs
    .map((doc) => mapLog(doc.id, doc.data() as Record<string, unknown>))
    .filter((log) => dateKeyFromIso(log.endedAt) === dateKey)

  const statesSnap = await db.collection(CUINA_CENTRAL_COLLECTIONS.modelStates).get()
  const states = statesSnap.docs.map((d) => mapModelState(d.id, d.data() as Record<string, unknown>))
  const stateByPair = new Map(states.map((s) => [`${s.articleId}::${s.machineId}`, s]))

  const dayBuckets = new Map<
    string,
    { minutes: number; qty: number; rejected: number; actualQtyPerHour: number[] }
  >()

  for (const log of logs) {
    const key = `${log.articleId}::${log.machineId}`
    const b = dayBuckets.get(key) || { minutes: 0, qty: 0, rejected: 0, actualQtyPerHour: [] }
    b.minutes += log.durationMinutes
    b.qty += log.quantityProduced
    b.rejected += log.quantityRejected
    if (log.durationMinutes > 0 && log.quantityProduced > 0) {
      b.actualQtyPerHour.push((log.quantityProduced / log.durationMinutes) * 60)
    }
    dayBuckets.set(key, b)
  }

  const deviations: DailyDeviationRow[] = []
  for (const [key, bucket] of dayBuckets.entries()) {
    const [articleId, machineId] = key.split('::')
    const state = stateByPair.get(key)
    const actualQtyPerHour =
      bucket.actualQtyPerHour.length > 0
        ? bucket.actualQtyPerHour.reduce((a, b) => a + b, 0) / bucket.actualQtyPerHour.length
        : null
    const theoretical = state?.theoreticalQtyPerHour ?? null
    const efficiencyRatio =
      theoretical && actualQtyPerHour
        ? Math.round((actualQtyPerHour / theoretical) * 1000) / 1000
        : state?.efficiencyRatio ?? null
    const deltaPct =
      theoretical && actualQtyPerHour
        ? Math.round(((actualQtyPerHour - theoretical) / theoretical) * 1000) / 10
        : null

    deviations.push({
      articleCode: state?.articleCode || articleId,
      machineCode: state?.machineCode || machineId,
      theoreticalQtyPerHour: theoretical,
      actualQtyPerHour: actualQtyPerHour ? Math.round(actualQtyPerHour * 100) / 100 : null,
      efficiencyRatio,
      deltaPct,
      sampleCount: logs.filter(
        (l) => l.articleId === articleId && l.machineId === machineId
      ).length,
    })
  }

  deviations.sort((a, b) => {
    const da = Math.abs(a.deltaPct ?? 0)
    const db = Math.abs(b.deltaPct ?? 0)
    return db - da
  })

  const alerts: string[] = []
  const recommendations: string[] = []

  for (const row of deviations) {
    if (row.efficiencyRatio != null && row.efficiencyRatio < ML_CONFIG.lowEfficiencyThreshold) {
      alerts.push(
        `Eficiència baixa: ${row.articleCode} a ${row.machineCode} (${Math.round(row.efficiencyRatio * 100)}% del teòric).`
      )
    }
    if (row.deltaPct != null && Math.abs(row.deltaPct) >= ML_CONFIG.deviationAlertPct) {
      alerts.push(
        `Desviació ${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%: ${row.articleCode} · ${row.machineCode}.`
      )
    }
  }

  const ratios = deviations.map((d) => d.efficiencyRatio).filter((v): v is number => v != null)
  const avgEfficiencyRatio =
    ratios.length > 0
      ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 1000) / 1000
      : null

  if (logs.length === 0) {
    recommendations.push('Cap registre de producció avui: revisar captura al final de torn.')
  } else if (alerts.length > 0) {
    recommendations.push(
      'Prioritzar revisió de processos amb desviació alta abans de planificar la setmana vinent.'
    )
  } else {
    recommendations.push('Producció alineada amb el model: podeu planificar amb predicció ML.')
  }

  const worst = deviations.filter((d) => (d.efficiencyRatio ?? 1) < 1).slice(0, 3)
  for (const w of worst) {
    recommendations.push(
      `Afina temps estàndard: ${w.articleCode} + ${w.machineCode} (real ${w.actualQtyPerHour ?? '?'} vs teòric ${w.theoreticalQtyPerHour ?? '?'}/h).`
    )
  }

  const report: DailyDecisionReport = {
    id: dateKey,
    dateKey,
    builtAt: Date.now(),
    logsCount: logs.length,
    totalProducedQty: logs.reduce((s, l) => s + l.quantityProduced, 0),
    totalRejectedQty: logs.reduce((s, l) => s + l.quantityRejected, 0),
    totalMinutes: logs.reduce((s, l) => s + l.durationMinutes, 0),
    pairCount: dayBuckets.size,
    avgEfficiencyRatio,
    deviations: deviations.slice(0, 30),
    alerts,
    recommendations,
  }

  await db.collection(CUINA_CENTRAL_COLLECTIONS.dailyReports).doc(dateKey).set(report, { merge: true })
  return report
}
