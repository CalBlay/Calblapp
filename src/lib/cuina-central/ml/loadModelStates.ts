import type { Firestore } from 'firebase-admin/firestore'
import { CUINA_CENTRAL_COLLECTIONS } from '../collections'
import { modelStateDocId } from './constants'
import type { ModelPairState } from './types'

export function mapModelStateDoc(id: string, data: Record<string, unknown>): ModelPairState {
  return {
    id: id.includes('__') ? id : modelStateDocId(String(data.articleId), String(data.machineId)),
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

export async function loadAllModelStates(db: Firestore): Promise<ModelPairState[]> {
  const snap = await db.collection(CUINA_CENTRAL_COLLECTIONS.modelStates).get()
  return snap.docs.map((d) => mapModelStateDoc(d.id, d.data() as Record<string, unknown>))
}
