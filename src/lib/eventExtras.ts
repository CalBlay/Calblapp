import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export type ExtraOutcome = 'none' | 'reported'

export type EventExtraEntry = {
  text: string
}

const norm = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

export function normalizeEventDay(raw?: string | null) {
  const value = String(raw || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

export function buildEventExtrasDocId(eventId: string, eventDay?: string | null) {
  const normalizedDay = normalizeEventDay(eventDay)
  return normalizedDay ? `${eventId}_${normalizedDay}` : String(eventId || '').trim()
}

export function normalizeLnKey(raw?: string | null) {
  const value = norm(raw)
  if (value === 'casaments') return 'casaments'
  if (value === 'empresa') return 'empresa'
  if (value === 'foodlovers') return 'foodlovers'
  if (value === 'agenda') return 'agenda'
  return 'altres'
}

export function isWeddingLn(raw?: string | null) {
  return normalizeLnKey(raw) === 'casaments'
}

export function sanitizeExtraEntries(raw: unknown): EventExtraEntry[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(/\r?\n/g)
    : []

  return values
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && 'text' in entry
        ? String((entry as { text?: unknown }).text || '')
        : ''
    )
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text }))
}

function firstDocString(doc: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = doc[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return ''
}

export async function getEventStageContext(eventId: string) {
  const snap = await db.collection('stage_verd').doc(String(eventId || '').trim()).get()
  if (!snap.exists) return null
  const data = snap.data() as Record<string, unknown>
  return {
    id: snap.id,
    lnKey: normalizeLnKey(String(data?.LN || '')),
    commercialInternal: firstDocString(data, [
      'ComercialIntern',
      'comercialIntern',
      'Comercial_Interna',
    ]),
    summary: firstDocString(data, ['NomEvent', 'summary']),
    eventCode: firstDocString(data, ['C_digo', 'Codi', 'codi']),
    location: firstDocString(data, ['Ubicacio', 'location']),
  }
}

async function lookupUserIdByPersonnelId(personnelId: string) {
  const userDoc = await db.collection('users').doc(personnelId).get()
  return userDoc.exists ? userDoc.id : null
}

export async function lookupUidByNameLoose(name?: string | null): Promise<string | null> {
  const rawName = String(name || '').trim()
  if (!rawName) return null

  let q = await db.collection('users').where('name', '==', rawName).limit(1).get()
  if (!q.empty) return q.docs[0].id

  const folded = norm(rawName)
  q = await db.collection('users').where('nameFold', '==', folded).limit(1).get()
  if (!q.empty) return q.docs[0].id

  q = await db.collection('personnel').where('name', '==', rawName).limit(1).get()
  if (!q.empty) return lookupUserIdByPersonnelId(q.docs[0].id)

  q = await db.collection('personnel').where('nameFold', '==', folded).limit(1).get()
  if (!q.empty) return lookupUserIdByPersonnelId(q.docs[0].id)

  return null
}
