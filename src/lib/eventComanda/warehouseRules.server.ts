import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'

const COL = EVENT_COMANDA_COLLECTIONS.warehouseRules

export type EventComandaWarehouseRule = {
  id: string
  prefix: string
  warehouseId: string
  createdAt: number
  updatedAt: number
}

const normalizePrefix = (prefix: string) =>
  String(prefix || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

export function warehouseRuleDocId(prefix: string) {
  return normalizePrefix(prefix)
}

const mapRule = (id: string, data: Record<string, unknown>): EventComandaWarehouseRule => ({
  id,
  prefix: String(data.prefix || id).trim().toUpperCase(),
  warehouseId: String(data.warehouseId || '').trim().toUpperCase(),
  createdAt: Number(data.createdAt) || 0,
  updatedAt: Number(data.updatedAt) || 0,
})

export async function ensureDefaultWarehouseRules(defaultWarehouseId: string) {
  const ref = db.collection(COL).doc('09')
  const snap = await ref.get()
  if (snap.exists) return
  const now = Date.now()
  await ref.set({
    prefix: '09',
    warehouseId: warehouseDocId(defaultWarehouseId),
    createdAt: now,
    updatedAt: now,
  })
}

function warehouseDocId(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export async function listEventComandaWarehouseRules(): Promise<EventComandaWarehouseRule[]> {
  const snap = await db.collection(COL).get()
  return snap.docs
    .map((doc) => mapRule(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => b.prefix.length - a.prefix.length || a.prefix.localeCompare(b.prefix))
}

export function resolveWarehouseIdForArticleCode(
  articleCode: string,
  rules: EventComandaWarehouseRule[]
): string | null {
  const normalized = String(articleCode || '').trim().toUpperCase()
  if (!normalized) return null

  let best: EventComandaWarehouseRule | null = null
  for (const rule of rules) {
    const prefix = rule.prefix.toUpperCase()
    if (!prefix || !normalized.startsWith(prefix)) continue
    if (!best || prefix.length > best.prefix.length) best = rule
  }
  return best?.warehouseId ?? null
}

export async function createEventComandaWarehouseRule(params: {
  prefix: string
  warehouseId: string
  userId?: string
}) {
  const prefix = normalizePrefix(params.prefix)
  const warehouseId = warehouseDocId(params.warehouseId)
  if (prefix.length < 2 || prefix.length > 5) {
    throw new Error('El prefix ha de tenir entre 2 i 5 caràcters.')
  }
  if (!warehouseId) throw new Error('Cal seleccionar un magatzem.')

  const ref = db.collection(COL).doc(prefix)
  const existing = await ref.get()
  if (existing.exists) throw new Error('Ja existeix una regla amb aquest prefix.')

  const now = Date.now()
  const payload = {
    prefix,
    warehouseId,
    createdAt: now,
    updatedAt: now,
    createdByUserId: params.userId || null,
    updatedByUserId: params.userId || null,
  }
  await ref.set(payload)
  return mapRule(prefix, payload)
}

export async function updateEventComandaWarehouseRule(
  id: string,
  params: { warehouseId: string; userId?: string }
) {
  const docId = warehouseRuleDocId(id)
  const ref = db.collection(COL).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Regla no trobada.')

  const warehouseId = warehouseDocId(params.warehouseId)
  if (!warehouseId) throw new Error('Cal seleccionar un magatzem.')

  const patch = {
    warehouseId,
    updatedAt: Date.now(),
    updatedByUserId: params.userId || null,
  }
  await ref.set(patch, { merge: true })
  const updated = await ref.get()
  return mapRule(updated.id, updated.data() as Record<string, unknown>)
}

export async function deleteEventComandaWarehouseRule(id: string) {
  const docId = warehouseRuleDocId(id)
  await db.collection(COL).doc(docId).delete()
}
