// ✅ file: src/services/firestore/logisticsService.ts
'use client'

import { firestoreClient } from '@/lib/firebase'

/**
 * 📦 Llegeix els esdeveniments logístics dins del rang especificat
 */
export async function getLogisticsEvents(start: Date, end: Date) {
  const snapshot = await firestoreClient
    .collection('stage_verd')
    .where('code', '!=', '')
    .where('DataInici', '>=', start)
    .where('DataInici', '<=', end)
    .get()

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

/**
 * ✏️ Actualitza o crea els camps de preparació per un esdeveniment
 */
export async function updatePreparation(id: string, data?: string, hora?: string) {
  if (!id) return

  const updateFields: Record<string, string> = {}
  if (data) updateFields.PreparacioData = data
  if (hora) updateFields.PreparacioHora = hora

  try {
    await firestoreClient.collection('stage_verd').doc(id).update(updateFields)
    console.log(`✅ Preparació actualitzada per ${id}`)
  } catch (err) {
    console.error('❌ Error actualitzant preparació:', err)
  }
}
