import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'

const COL = EVENT_COMANDA_COLLECTIONS.warehouses

export type EventComandaWarehouse = {
  id: string
  code: string
  name: string
  isActive: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

import { normalizeWarehouseCode, warehouseDocId } from '@/lib/eventComanda/warehouseIds'

export { normalizeWarehouseCode, warehouseDocId }

const mapWarehouse = (id: string, data: Record<string, unknown>): EventComandaWarehouse => ({
  id,
  code: String(data.code || id).trim().toUpperCase(),
  name: String(data.name || '').trim(),
  isActive: data.isActive !== false,
  sortOrder: Number(data.sortOrder) || 0,
  createdAt: Number(data.createdAt) || 0,
  updatedAt: Number(data.updatedAt) || 0,
})

export async function ensureDefaultWarehousesAndRules() {
  const { ensureDefaultWarehouseRules } = await import('@/lib/eventComanda/warehouseRules.server')
  const snap = await db.collection(COL).limit(1).get()
  if (!snap.empty) return

  const now = Date.now()
  await db.collection(COL).doc('MAG').set({
    code: 'MAG',
    name: 'Magatzem',
    isActive: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })
  await ensureDefaultWarehouseRules('MAG')
}

export async function listEventComandaWarehouses(activeOnly = false): Promise<EventComandaWarehouse[]> {
  await ensureDefaultWarehousesAndRules()
  const snap = await db.collection(COL).get()
  return snap.docs
    .map((doc) => mapWarehouse(doc.id, doc.data() as Record<string, unknown>))
    .filter((warehouse) => (activeOnly ? warehouse.isActive : true))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
}

export async function getWarehouseById(id: string): Promise<EventComandaWarehouse | null> {
  const docId = warehouseDocId(id)
  if (!docId) return null
  const snap = await db.collection(COL).doc(docId).get()
  if (!snap.exists) return null
  return mapWarehouse(snap.id, snap.data() as Record<string, unknown>)
}

export async function createEventComandaWarehouse(params: {
  code: string
  name: string
  sortOrder?: number
  userId?: string
}) {
  const code = warehouseDocId(params.code)
  const name = String(params.name || '').trim()
  if (!code || code.length < 2 || code.length > 8) {
    throw new Error('El codi de magatzem ha de tenir entre 2 i 8 caràcters.')
  }
  if (!name) throw new Error('Cal el nom del magatzem.')

  const ref = db.collection(COL).doc(code)
  const existing = await ref.get()
  if (existing.exists) throw new Error('Ja existeix un magatzem amb aquest codi.')

  const now = Date.now()
  const payload = {
    code,
    name,
    isActive: true,
    sortOrder: Number(params.sortOrder) || 0,
    createdAt: now,
    updatedAt: now,
    createdByUserId: params.userId || null,
    updatedByUserId: params.userId || null,
  }
  await ref.set(payload)
  return mapWarehouse(code, payload)
}

export async function updateEventComandaWarehouse(
  id: string,
  params: {
    name?: string
    isActive?: boolean
    sortOrder?: number
    userId?: string
  }
) {
  const docId = warehouseDocId(id)
  const ref = db.collection(COL).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Magatzem no trobat.')

  const patch: Record<string, unknown> = {
    updatedAt: Date.now(),
    updatedByUserId: params.userId || null,
  }
  if (params.name !== undefined) patch.name = String(params.name || '').trim()
  if (params.isActive !== undefined) patch.isActive = Boolean(params.isActive)
  if (params.sortOrder !== undefined) patch.sortOrder = Number(params.sortOrder) || 0

  await ref.set(patch, { merge: true })
  const updated = await ref.get()
  return mapWarehouse(updated.id, updated.data() as Record<string, unknown>)
}

export async function deleteEventComandaWarehouse(id: string) {
  const docId = warehouseDocId(id)
  const { deleteWarehouseMembers } = await import('@/lib/eventComanda/warehouseMembers.server')
  await deleteWarehouseMembers(docId)
  await db.collection(COL).doc(docId).delete()
}
