import { createHash } from 'crypto'
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import {
  SPACES_ZOHO_ACCOUNTS_COLLECTION,
  SPACES_ZOHO_CLIENTS_COLLECTION,
} from '@/lib/spacesPermissions'
import { zohoDealClientNameForMatch } from '@/services/spaces/manualReserveZohoMatch'

export type SpacesZohoClientSource = 'zoho' | 'manual'

export interface SpacesZohoAccountDoc {
  nom: string
  nameKey: string
  zohoAccountId?: string | null
  source: 'zoho'
  updatedAt: string
  lastSeenAt: string
  dealCount?: number
}

export interface SpacesZohoClientDoc {
  nom: string
  nameKey: string
  source: SpacesZohoClientSource
  updatedAt: string
  lastSeenAt: string
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

type ZohoLookup = string | { id?: string; name?: string | null } | null | undefined
type ZohoAccountInput = {
  Account_Name?: ZohoLookup
}

function extractZohoLookup(value: ZohoLookup): { nom: string; id?: string } | null {
  if (typeof value === 'string') {
    const nom = value.trim()
    return nom ? { nom } : null
  }
  if (value && typeof value === 'object') {
    const nom = String(value.name || '').trim()
    if (!nom) return null
    const id = String(value.id || '').trim()
    return id ? { nom, id } : { nom }
  }
  return null
}

/** Si el client no és `Account_Name`, es pot definir un camp API alternatiu al `.env`. */
const ZOHO_EXTRA_CLIENT_FIELD = String(
  process.env.ZOHO_DEAL_FIELD_CLIENT || ''
).trim()

/**
 * Compte CRM (Account_Name) d'una oportunitat Zoho.
 * Només per omplir `spaces_zoho_accounts`; no usa Deal_Name.
 */
export function extractZohoAccountFromDeal(deal: {
  Account_Name?: ZohoLookup
}): { nom: string; zohoAccountId?: string } | null {
  const account = extractZohoLookup(deal.Account_Name)
  if (account) {
    return {
      nom: account.nom,
      zohoAccountId: account.id,
    }
  }

  if (ZOHO_EXTRA_CLIENT_FIELD) {
    const dynamicDeal = deal as unknown as Record<string, unknown>
    const extra = extractZohoLookup(dynamicDeal[ZOHO_EXTRA_CLIENT_FIELD] as ZohoLookup)
    if (extra) {
      return {
        nom: extra.nom,
        zohoAccountId: extra.id,
      }
    }
  }

  return null
}

/**
 * Nom de client per matching manual ↔ Zoho (Account_Name o segment de Deal_Name).
 */
export function extractZohoClientNameFromDeal(deal: {
  Deal_Name?: string | null
  Account_Name?: ZohoLookup
}): string {
  const account = extractZohoAccountFromDeal(deal)
  if (account?.nom) return account.nom
  return zohoDealClientNameForMatch(deal.Deal_Name)
}

function aggregateAccountNames(
  accounts: Iterable<{ nom: string; zohoAccountId?: string }>
): Map<string, { nom: string; zohoAccountId?: string; dealCount: number }> {
  const byKey = new Map<
    string,
    { nom: string; zohoAccountId?: string; dealCount: number }
  >()
  for (const raw of accounts) {
    const nom = String(raw.nom || '').trim()
    if (!nom) continue
    const nameKey = normalizeZohoClientNameKey(nom)
    if (!nameKey || SKIP_NAMES.has(nameKey)) continue
    const prev = byKey.get(nameKey)
    if (prev) {
      prev.dealCount += 1
      if (!prev.zohoAccountId && raw.zohoAccountId) {
        prev.zohoAccountId = raw.zohoAccountId
      }
    } else {
      byKey.set(nameKey, {
        nom,
        zohoAccountId: raw.zohoAccountId,
        dealCount: 1,
      })
    }
  }
  return byKey
}

/** Upsert comptes Zoho (Account_Name) a `spaces_zoho_accounts`. */
export async function syncZohoAccountsFromDeals(
  deals: Iterable<ZohoAccountInput>
): Promise<{ upserted: number }> {
  const accounts: { nom: string; zohoAccountId?: string }[] = []
  for (const deal of deals) {
    const account = extractZohoAccountFromDeal(deal)
    if (account) accounts.push(account)
  }

  const byKey = aggregateAccountNames(accounts)
  if (byKey.size === 0) return { upserted: 0 }

  const now = new Date().toISOString()
  const entries = Array.from(byKey.entries())
  let upserted = 0

  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const chunk = entries.slice(i, i + BATCH_LIMIT)
    const batch = firestore.batch()
    for (const [nameKey, { nom, zohoAccountId, dealCount }] of chunk) {
      const docId = zohoClientDocId(nameKey)
      if (!docId) continue
      const ref = firestore.collection(SPACES_ZOHO_ACCOUNTS_COLLECTION).doc(docId)
      batch.set(
        ref,
        {
          nom,
          nameKey,
          zohoAccountId: zohoAccountId || null,
          source: 'zoho',
          updatedAt: now,
          lastSeenAt: now,
          dealCount,
        } satisfies SpacesZohoAccountDoc,
        { merge: true }
      )
    }
    await batch.commit()
    upserted += chunk.length
  }

  return { upserted }
}

/** Afegeix o actualitza un nom de client manual a `spaces_zoho_clients`. */
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
      } satisfies SpacesZohoClientDoc,
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

/** Llista unificada per al desplegable: comptes Zoho + clients manuals (sense duplicats). */
export function mergeClientNameLists(
  accountNames: string[],
  manualNames: string[]
): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const nom of [...accountNames, ...manualNames]) {
    const trimmed = String(nom || '').trim()
    if (!trimmed) continue
    const key = normalizeZohoClientNameKey(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(trimmed)
  }
  return merged.sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}
