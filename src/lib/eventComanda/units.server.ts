import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'

const COL = EVENT_COMANDA_COLLECTIONS.units

export type EventComandaUnit = {
  id: string
  code: string
  name: string
  isActive: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

const normalizeUnitCode = (code: string) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

export function unitDocId(code: string) {
  return normalizeUnitCode(code)
}

const mapUnit = (id: string, data: Record<string, unknown>): EventComandaUnit => ({
  id,
  code: String(data.code || id).trim().toUpperCase(),
  name: String(data.name || '').trim(),
  isActive: data.isActive !== false,
  sortOrder: Number(data.sortOrder) || 0,
  createdAt: Number(data.createdAt) || 0,
  updatedAt: Number(data.updatedAt) || 0,
})

const DEFAULT_UNITS: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: 'UN', name: 'Unitat', sortOrder: 0 },
  { code: 'ONU', name: 'Unitat (ONU)', sortOrder: 1 },
  { code: 'C', name: 'Caixa', sortOrder: 2 },
  { code: 'KG', name: 'Quilogram', sortOrder: 3 },
  { code: 'L', name: 'Litres', sortOrder: 4 },
  { code: 'UD', name: 'Unitat de venda', sortOrder: 5 },
]

export async function ensureDefaultUnits() {
  const snap = await db.collection(COL).limit(1).get()
  if (!snap.empty) return

  const now = Date.now()
  const batch = db.batch()
  for (const unit of DEFAULT_UNITS) {
    const id = unitDocId(unit.code)
    if (!id) continue
    batch.set(db.collection(COL).doc(id), {
      code: id,
      name: unit.name,
      isActive: true,
      sortOrder: unit.sortOrder,
      createdAt: now,
      updatedAt: now,
    })
  }
  await batch.commit()
}

export async function listEventComandaUnits(activeOnly = false): Promise<EventComandaUnit[]> {
  await ensureDefaultUnits()
  const snap = await db.collection(COL).get()
  return snap.docs
    .map((doc) => mapUnit(doc.id, doc.data() as Record<string, unknown>))
    .filter((unit) => (activeOnly ? unit.isActive : true))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
}

export async function getUnitByCode(code: string): Promise<EventComandaUnit | null> {
  const id = unitDocId(code)
  if (!id) return null
  const snap = await db.collection(COL).doc(id).get()
  if (!snap.exists) return null
  return mapUnit(snap.id, snap.data() as Record<string, unknown>)
}

export async function resolveEventComandaUnitCode(code: string, activeOnly = true) {
  const normalized = eventComandaQtyUnit(code)
  const unit = await getUnitByCode(normalized)
  if (!unit) return null
  if (activeOnly && !unit.isActive) return null
  return unit.code
}

export async function createEventComandaUnit(params: {
  code: string
  name: string
  sortOrder?: number
  userId?: string
}) {
  const code = unitDocId(params.code)
  const name = String(params.name || '').trim()
  if (!code || code.length < 1 || code.length > 8) {
    throw new Error('El codi d\'unitat ha de tenir entre 1 i 8 caràcters.')
  }
  if (!name) throw new Error('Cal el nom de la unitat.')

  const ref = db.collection(COL).doc(code)
  const existing = await ref.get()
  if (existing.exists) throw new Error('Ja existeix una unitat amb aquest codi.')

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
  return mapUnit(code, payload)
}

export async function updateEventComandaUnit(
  id: string,
  params: {
    name?: string
    isActive?: boolean
    sortOrder?: number
    userId?: string
  }
) {
  const docId = unitDocId(id)
  const ref = db.collection(COL).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Unitat no trobada.')

  const patch: Record<string, unknown> = {
    updatedAt: Date.now(),
    updatedByUserId: params.userId || null,
  }
  if (params.name !== undefined) patch.name = String(params.name || '').trim()
  if (params.isActive !== undefined) patch.isActive = Boolean(params.isActive)
  if (params.sortOrder !== undefined) patch.sortOrder = Number(params.sortOrder) || 0

  await ref.set(patch, { merge: true })
  const updated = await ref.get()
  return mapUnit(updated.id, updated.data() as Record<string, unknown>)
}

export async function deleteEventComandaUnit(id: string) {
  const docId = unitDocId(id)
  await db.collection(COL).doc(docId).delete()
}
