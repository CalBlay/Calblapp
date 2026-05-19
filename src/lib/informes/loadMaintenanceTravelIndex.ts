import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  buildMaintenanceTravelIndex,
  type MaintenanceCenterTravelRow,
} from '@/lib/maintenanceCenterTravel'

/** Índex nom/codi → minuts (anada) per informes de manteniment. */
export async function loadMaintenanceTravelIndexForInformes() {
  const snap = await db.collection('finques').get()
  const centers: MaintenanceCenterTravelRow[] = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      const name = String(data.nom || data.name || '').trim()
      if (!name) return null
      return {
        name,
        code: String(data.codi || data.code || doc.id || '').trim(),
        travelMinutes: Math.max(
          0,
          Math.round(Number(data.maintenanceTravelMinutes ?? 0) || 0)
        ),
      }
    })
    .filter((row): row is MaintenanceCenterTravelRow => row !== null)

  return buildMaintenanceTravelIndex(centers)
}
