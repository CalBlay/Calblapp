/**
 * Matching entre reserves manuals (spaces_manual_reserves) i esdeveniments Zoho (stage_*).
 * Usat durant syncZohoDealsToFirestore per substituir la reserva lila i conservar createdAt.
 *
 * Coincidència (4 criteris):
 * - Comercial (trim, sense accents, case-insensitive)
 * - Nom client (NomClient manual = NomEvent Zoho, normalitzat)
 * - Dia d'event (DataInici, yyyy-MM-dd)
 * - Ubicació (nom finca sense codi entre parèntesis)
 *
 * Proves: npx ts-node --transpile-only scripts/test-manual-reserve-zoho-match.ts
 */

export interface ManualReserveDoc {
  id: string
  Comercial?: string
  NomClient?: string
  Ubicacio?: string
  DataInici?: string
  DataFi?: string
  createdAt?: string | { toDate?: () => Date }
  replacedByZoho?: boolean
  origen?: string
}

export interface ZohoDealMatchInput {
  idZoho: string
  Comercial: string
  NomEvent: string
  Ubicacio: string
  DataInici: string | null
}

export interface ManualReplacementEntry {
  createdAt: string
  mergedFromManualId: string
  nomClient?: string
}

const MANUAL_RESERVE_CREATED_AT_FIELD = 'manualReserveCreatedAt'

export interface ManualReplacementResult {
  byZohoId: Map<string, ManualReplacementEntry>
  manualIdsToDelete: string[]
  replacedCount: number
}

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const stripCode = (t: string) =>
  t.replace(/\s*\([^)]+\)\s*/g, '').trim()

export function normalizeCommercialKey(raw: unknown): string {
  const value = unaccent(String(raw || '').trim().toLowerCase())
  if (!value || value === '—' || value === '-') return ''
  return value
}

export function normalizeEventDay(raw: unknown): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.includes('T')) return value.split('T')[0].trim()
  if (value.includes(' ')) return value.split(' ')[0].trim()
  return value.slice(0, 10)
}

export function normalizeUbicacioKey(raw: unknown): string {
  const base = stripCode(String(raw || '').trim())
  return unaccent(base).toLowerCase().trim()
}

/** Sufixos societat (S.A., S.L., …) per comparar NomClient amb NomEvent Zoho. */
const LEGAL_ENTITY_SUFFIX =
  /,?\s*(s\.?\s*a\.?(?:\s*u\.?)?|s\.?\s*l\.?(?:\s*u\.?)?|s\.?\s*c\.?|sa|sl|slu|sc|sau|ltd|inc|corp)\.?\s*$/i

function normalizeLegalEntitySuffix(raw: string): string {
  return unaccent(raw).toLowerCase().replace(/[^a-z]/g, '')
}

function splitClientNameKey(raw: unknown): { base: string; suffix: string } {
  let value = unaccent(String(raw || '').trim().toLowerCase())
  value = value.replace(/\s+/g, ' ').trim()
  const suffixMatch = value.match(LEGAL_ENTITY_SUFFIX)
  const suffix = suffixMatch?.[1]
    ? normalizeLegalEntitySuffix(suffixMatch[1])
    : ''
  if (suffixMatch) value = value.slice(0, suffixMatch.index).trim()
  value = value.replace(/[,.\s]+$/g, '').trim()
  return { base: value, suffix }
}

export function normalizeClientNameKey(raw: unknown): string {
  return splitClientNameKey(raw).base
}

export function clientNamesMatch(manualRaw: unknown, dealRaw: unknown): boolean {
  const manual = splitClientNameKey(manualRaw)
  const deal = splitClientNameKey(dealRaw)
  if (!manual.base || !deal.base) return false
  if (manual.base !== deal.base) return false
  if (manual.suffix && deal.suffix && manual.suffix !== deal.suffix) {
    return false
  }
  return true
}

/** Normalitza qualsevol valor de createdAt (string, Timestamp, ms) a ISO. */
export function docCreatedAtIso(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = new Date(raw).getTime()
    return Number.isNaN(parsed) ? raw.trim() : new Date(parsed).toISOString()
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (raw && typeof raw === 'object' && 'toDate' in raw) {
    const date = (raw as { toDate?: () => Date }).toDate?.()
    if (date && !Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

export function manualIdToCreatedAtIso(manualId: string): string | null {
  const legacy = /^spaces_manual_(\d+)$/.exec(manualId)
  if (!legacy) return null
  return new Date(Number(legacy[1])).toISOString()
}

export function manualReserveCreatedAtIso(
  manual: ManualReserveDoc
): string | null {
  const fromField = docCreatedAtIso(manual.createdAt)
  if (fromField) return fromField
  return manualIdToCreatedAtIso(manual.id)
}

export function manualReserveCreatedAtMs(manual: ManualReserveDoc): number {
  const iso = manualReserveCreatedAtIso(manual)
  if (!iso) return Number.MAX_SAFE_INTEGER
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms
}

export function manualReserveMatchesZohoDeal(
  manual: ManualReserveDoc,
  deal: ZohoDealMatchInput
): boolean {
  const dealDay = normalizeEventDay(deal.DataInici)
  const manualDay = normalizeEventDay(manual.DataInici)
  if (!dealDay || !manualDay || dealDay !== manualDay) return false

  const commercialManual = normalizeCommercialKey(manual.Comercial)
  const commercialDeal = normalizeCommercialKey(deal.Comercial)
  if (!commercialManual || !commercialDeal) return false
  if (commercialManual !== commercialDeal) return false

  const ubicManual = normalizeUbicacioKey(manual.Ubicacio)
  const ubicDeal = normalizeUbicacioKey(deal.Ubicacio)
  if (!ubicManual || !ubicDeal) return false
  if (ubicManual !== ubicDeal) return false

  if (!clientNamesMatch(manual.NomClient, deal.NomEvent)) return false

  return true
}

/**
 * Assigna com a màxim una reserva manual per deal Zoho (la més antiga en createdAt).
 * Cada manual només es consumeix una vegada.
 */
export function resolveManualReserveReplacements(
  manuals: ManualReserveDoc[],
  deals: ZohoDealMatchInput[]
): ManualReplacementResult {
  const byZohoId = new Map<string, ManualReplacementEntry>()
  const manualIdsToDelete: string[] = []
  const usedManualIds = new Set<string>()

  const eligibleManuals = manuals
    .filter((m) => !m.replacedByZoho)
    .filter((m) => {
      const origen = String(m.origen || '').toLowerCase()
      return !origen || origen === 'spaces_manual'
    })
    .sort(
      (a, b) =>
        manualReserveCreatedAtMs(a) - manualReserveCreatedAtMs(b) ||
        a.id.localeCompare(b.id)
    )

  const sortedDeals = [...deals].sort((a, b) =>
    a.idZoho.localeCompare(b.idZoho)
  )

  for (const deal of sortedDeals) {
    if (!normalizeEventDay(deal.DataInici)) continue

    const candidates = eligibleManuals.filter(
      (manual) =>
        !usedManualIds.has(manual.id) &&
        manualReserveMatchesZohoDeal(manual, deal)
    )
    if (candidates.length === 0) continue

    const manual = candidates[0]
    const createdAt = manualReserveCreatedAtIso(manual)
    if (!createdAt) continue

    usedManualIds.add(manual.id)
    manualIdsToDelete.push(manual.id)
    byZohoId.set(deal.idZoho, {
      createdAt,
      mergedFromManualId: manual.id,
      nomClient: manual.NomClient,
    })
  }

  return {
    byZohoId,
    manualIdsToDelete,
    replacedCount: manualIdsToDelete.length,
  }
}

/** createdAt autoritatiu quan el doc ve d'una reserva manual fusionada. */
export function mergedManualCreatedAtIso(
  mergedFromManualId: string,
  replacement?: ManualReplacementEntry,
  existingCreatedAt?: unknown
): string | null {
  if (replacement?.createdAt) return replacement.createdAt

  const fromManualId = manualIdToCreatedAtIso(mergedFromManualId)
  if (fromManualId) return fromManualId

  return docCreatedAtIso(existingCreatedAt)
}

export function applyManualCreatedAtPreserve(
  data: Record<string, unknown>,
  dealId: string,
  replacements: Map<string, ManualReplacementEntry>,
  existing?: Record<string, unknown>
): Record<string, unknown> {
  const replacement = replacements.get(dealId)
  const out = { ...data }

  const mergedFromManualId =
    (replacement?.mergedFromManualId as string | undefined) ||
    (existing?.mergedFromManualId as string | undefined)

  if (mergedFromManualId) {
    out.mergedFromManualId = mergedFromManualId
    if (replacement?.nomClient) {
      out.mergedFromManualNomClient = replacement.nomClient
    } else if (existing?.mergedFromManualNomClient) {
      out.mergedFromManualNomClient = existing.mergedFromManualNomClient
    }
    const createdAt = mergedManualCreatedAtIso(
      mergedFromManualId,
      replacement,
      existing?.createdAt
    )
    if (createdAt) {
      out.createdAt = createdAt
      out[MANUAL_RESERVE_CREATED_AT_FIELD] = createdAt
    } else if (existing?.[MANUAL_RESERVE_CREATED_AT_FIELD] !== undefined) {
      out[MANUAL_RESERVE_CREATED_AT_FIELD] =
        existing[MANUAL_RESERVE_CREATED_AT_FIELD]
    }
    return out
  }

  const createdAt =
    replacement?.createdAt || docCreatedAtIso(existing?.createdAt)

  if (createdAt) {
    out.createdAt = createdAt
  }

  if (existing?.[MANUAL_RESERVE_CREATED_AT_FIELD] !== undefined) {
    out[MANUAL_RESERVE_CREATED_AT_FIELD] =
      existing[MANUAL_RESERVE_CREATED_AT_FIELD]
  }

  return out
}

/** Elimina metadades de fusió si el manual encara existeix però no correspon al deal. */
export function stripInvalidManualMerge(
  existing: Record<string, unknown> | undefined,
  deal: ZohoDealMatchInput,
  manuals: ManualReserveDoc[]
): Record<string, unknown> | undefined {
  if (!existing?.mergedFromManualId) return existing

  const mergeId = String(existing.mergedFromManualId)
  const manual = manuals.find((m) => m.id === mergeId)
  if (manual && !manualReserveMatchesZohoDeal(manual, deal)) {
    const {
      mergedFromManualId: _mergedFromManualId,
      createdAt: _createdAt,
      manualReserveCreatedAt: _manualReserveCreatedAt,
      ...rest
    } = existing
    return rest
  }

  const storedClient = existing.mergedFromManualNomClient
  if (storedClient && !clientNamesMatch(storedClient, deal.NomEvent)) {
    const {
      mergedFromManualId: _mergedFromManualId,
      mergedFromManualNomClient: _mergedFromManualNomClient,
      createdAt: _createdAt,
      manualReserveCreatedAt: _manualReserveCreatedAt,
      ...rest
    } =
      existing
    return rest
  }

  return existing
}
