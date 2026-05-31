import { createHash } from 'crypto'
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import { SPACES_ZOHO_CLIENTS_COLLECTION } from '@/lib/spacesPermissions'

export type SpacesZohoClientSource = 'zoho' | 'manual'

export interface SpacesZohoClientDoc {
  nom: string
  nameKey: string
  source: SpacesZohoClientSource
  updatedAt: string
  lastSeenAt: string
  dealCount?: number
}

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const slugifyKey = (t: string) =>
  unaccent(t)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Clau normalitzada per deduplicar noms de client (case/accent insensitive). */
export function normalizeZohoClientNameKey(raw: string): string {
  return unaccent(String(raw || '').trim().toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
}

export function zohoClientDocId(nameKey: string): string {
  const slug = slugifyKey(nameKey)
  if (slug) return slug
  return createHash('sha256').update(nameKey).digest('hex').slice(0, 32)
}

const BATCH_LIMIT = 400
const SKIP_NAMES = new Set(['sense nom'])

function aggregateDealNames(dealNames: Iterable<string>): Map<string, { nom: string; dealCount: number }> {
  const byKey = new Map<string, { nom: string; dealCount: number }>()
  for (const raw of dealNames) {
    const nom = String(raw || '').trim()
    if (!nom) continue
    const nameKey = normalizeZohoClientNameKey(nom)
    if (!nameKey || SKIP_NAMES.has(nameKey)) continue
    const prev = byKey.get(nameKey)
    if (prev) {
      prev.dealCount += 1
    } else {
      byKey.set(nameKey, { nom, dealCount: 1 })
    }
  }
  return byKey
}

/** Upsert clients from Zoho Deal_Name values (called during sync). */
export async function syncZohoClientsFromDealNames(
  dealNames: Iterable<string>
): Promise<{ upserted: number }> {
  const byKey = aggregateDealNames(dealNames)
  if (byKey.size === 0) return { upserted: 0 }

  const now = new Date().toISOString()
  const entries = Array.from(byKey.entries())
  let upserted = 0

  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const chunk = entries.slice(i, i + BATCH_LIMIT)
    const batch = firestore.batch()
    for (const [nameKey, { nom, dealCount }] of chunk) {
      const docId = zohoClientDocId(nameKey)
      if (!docId) continue
      const ref = firestore.collection(SPACES_ZOHO_CLIENTS_COLLECTION).doc(docId)
      batch.set(
        ref,
        {
          nom,
          nameKey,
          source: 'zoho',
          updatedAt: now,
          lastSeenAt: now,
          dealCount,
        } satisfies SpacesZohoClientDoc,
        { merge: true }
      )
    }
    await batch.commit()
    upserted += chunk.length
  }

  return { upserted }
}

/** Add or refresh a client name from a manual reserve (optional UX). */
export async function upsertSpacesZohoClient(
  nomRaw: string,
  source: SpacesZohoClientSource = 'manual'
): Promise<void> {
  const nom = String(nomRaw || '').trim()
  if (!nom) return
  const nameKey = normalizeZohoClientNameKey(nom)
  if (!nameKey || SKIP_NAMES.has(nameKey)) return
  const docId = zohoClientDocId(nameKey)
  if (!docId) return

  const now = new Date().toISOString()
  await firestore
    .collection(SPACES_ZOHO_CLIENTS_COLLECTION)
    .doc(docId)
    .set(
      {
        nom,
        nameKey,
        source,
        updatedAt: now,
        lastSeenAt: now,
      } satisfies Omit<SpacesZohoClientDoc, 'dealCount'>,
      { merge: true }
    )
}

export function filterClientNames(
  names: string[],
  query?: string
): string[] {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
  const q = normalizeZohoClientNameKey(query || '')
  if (!q) return sorted
  return sorted.filter((nom) => normalizeZohoClientNameKey(nom).includes(q))
}
