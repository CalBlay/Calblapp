import type { Firestore } from 'firebase-admin/firestore'
import { CUINA_CENTRAL_COLLECTIONS } from '../collections'
import { ML_CONFIG, modelStateDocId } from './constants'
import { extractLearningFeatures, type ProductionLogPayload } from './features'
import { computeWindowStats, confidenceFromSampleCount, ema } from './stats'
const DAY_MS = 86_400_000

async function theoreticalQtyForPair(
  db: Firestore,
  articleId: string,
  machineId: string
): Promise<number | null> {
  const snap = await db
    .collection(CUINA_CENTRAL_COLLECTIONS.machineArticleRates)
    .where('articleId', '==', articleId)
    .where('machineId', '==', machineId)
    .limit(1)
    .get()
  if (snap.empty) return null
  const qty = Number(snap.docs[0]!.data().qtyPerHour)
  return Number.isFinite(qty) && qty > 0 ? qty : null
}

/** Recalcula l'estat ML d'un parell article·màquina des de totes les mostres. */
export async function rebuildPairModelState(
  db: Firestore,
  articleId: string,
  machineId: string,
  meta: {
    articleCode: string
    articleName: string
    machineCode: string
    machineName: string
    unit: string
  }
) {
  const snap = await db
    .collection(CUINA_CENTRAL_COLLECTIONS.learningSamples)
    .where('articleId', '==', articleId)
    .get()

  const now = Date.now()
  const points = snap.docs
    .filter((doc) => String(doc.data().machineId || '') === machineId)
    .map((doc) => {
      const d = doc.data()
      return {
        minutesPerUnit: Number(d.minutesPerUnit) || 0,
        qtyPerHour: Number(d.qtyPerHour) || 0,
        at: Number(d.createdAt) || 0,
        endedAt: String(d.dateKey || ''),
      }
    })
    .filter((p) => p.minutesPerUnit > 0)

  const recentMinutesPerUnit = points.map((p) => p.minutesPerUnit).slice(-ML_CONFIG.recentBufferMax)
  const chronological = [...points].sort((a, b) => a.at - b.at)
  let predictedMinutesPerUnit: number | null = null
  for (const p of chronological) {
    predictedMinutesPerUnit = ema(
      predictedMinutesPerUnit,
      p.minutesPerUnit,
      ML_CONFIG.emaAlpha
    )
  }
  const last = chronological[chronological.length - 1]
  const predictedQtyPerHour =
    predictedMinutesPerUnit && predictedMinutesPerUnit > 0
      ? 60 / predictedMinutesPerUnit
      : last?.qtyPerHour ?? null

  const theoreticalQtyPerHour = await theoreticalQtyForPair(db, articleId, machineId)
  const efficiencyRatio =
    theoreticalQtyPerHour && predictedQtyPerHour
      ? Math.round((predictedQtyPerHour / theoreticalQtyPerHour) * 1000) / 1000
      : null

  const allTime = computeWindowStats(points, 0)
  const last30d = computeWindowStats(points, now - ML_CONFIG.window30d * DAY_MS)
  const last7d = computeWindowStats(points, now - ML_CONFIG.window7d * DAY_MS)

  const pairId = modelStateDocId(articleId, machineId)
  const payload = {
    articleId,
    articleCode: meta.articleCode,
    articleName: meta.articleName,
    machineId,
    machineCode: meta.machineCode,
    machineName: meta.machineName,
    unit: meta.unit,
    theoreticalQtyPerHour,
    predictedMinutesPerUnit:
      predictedMinutesPerUnit != null
        ? Math.round(predictedMinutesPerUnit * 1000) / 1000
        : null,
    predictedQtyPerHour:
      predictedQtyPerHour != null ? Math.round(predictedQtyPerHour * 100) / 100 : null,
    efficiencyRatio,
    allTime,
    last30d,
    last7d,
    recentMinutesPerUnit,
    recentPoints: points.slice(-ML_CONFIG.recentBufferMax),
    confidence: confidenceFromSampleCount(allTime.sampleCount),
    lastSampleAt: last ? `${last.endedAt}T12:00:00.000Z` : null,
    updatedAt: now,
  }

  await db.collection(CUINA_CENTRAL_COLLECTIONS.modelStates).doc(pairId).set(payload, { merge: true })
  return { pairId, confidence: payload.confidence, sampleCount: allTime.sampleCount }
}

/** Pipeline: cada registre de producció alimenta mostres + model (idempotent per log id). */
export async function ingestProductionLog(
  db: Firestore,
  productionLogId: string,
  log: ProductionLogPayload
) {
  const features = extractLearningFeatures(log)
  if (features.minutesPerUnit <= 0) return { ok: false as const, reason: 'invalid_duration' }

  const now = Date.now()
  await db
    .collection(CUINA_CENTRAL_COLLECTIONS.learningSamples)
    .doc(productionLogId)
    .set(
      {
        productionLogId,
        dateKey: features.dateKey,
        articleId: log.articleId,
        articleCode: log.articleCode,
        articleName: log.articleName,
        machineId: log.machineId,
        machineCode: log.machineCode,
        shiftId: log.shiftId,
        dayOfWeek: features.dayOfWeek,
        quantityProduced: log.quantityProduced,
        quantityRejected: log.quantityRejected,
        durationMinutes: log.durationMinutes,
        minutesPerUnit: features.minutesPerUnit,
        qtyPerHour: features.qtyPerHour,
        operatorCount: features.operatorCount,
        unit: log.unit,
        createdAt: now,
      },
      { merge: true }
    )

  const rebuilt = await rebuildPairModelState(db, log.articleId, log.machineId, {
    articleCode: log.articleCode,
    articleName: log.articleName,
    machineCode: log.machineCode,
    machineName: log.machineName,
    unit: log.unit,
  })

  return { ok: true as const, ...rebuilt }
}

export async function rebuildAllModelStates(db: Firestore) {
  const deleteCol = async (name: string) => {
    const snap = await db.collection(name).get()
    if (!snap.empty) {
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  }

  await deleteCol(CUINA_CENTRAL_COLLECTIONS.modelStates)
  await deleteCol(CUINA_CENTRAL_COLLECTIONS.learningSamples)

  const logsSnap = await db
    .collection(CUINA_CENTRAL_COLLECTIONS.productionLogs)
    .orderBy('endedAt', 'asc')
    .get()

  let processed = 0
  for (const doc of logsSnap.docs) {
    const d = doc.data()
    await ingestProductionLog(db, doc.id, {
      articleId: String(d.articleId || ''),
      articleCode: String(d.articleCode || ''),
      articleName: String(d.articleName || ''),
      machineId: String(d.machineId || ''),
      machineCode: String(d.machineCode || ''),
      machineName: String(d.machineName || ''),
      shiftId: String(d.shiftId || ''),
      shiftName: String(d.shiftName || ''),
      unit: String(d.unit || 'kg'),
      quantityProduced: Number(d.quantityProduced) || 0,
      quantityRejected: Number(d.quantityRejected) || 0,
      startedAt: String(d.startedAt || ''),
      endedAt: String(d.endedAt || ''),
      durationMinutes: Number(d.durationMinutes) || 0,
      operatorNames: String(d.operatorNames || ''),
      notes: String(d.notes || ''),
      customFields: {},
    })
    processed++
  }

  return { processed, logs: logsSnap.size }
}
