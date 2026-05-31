/**
 * Matching entre reserves manuals (spaces_manual_reserves) i esdeveniments Zoho (stage_*).
 * Usat durant syncZohoDealsToFirestore per substituir la reserva lila i conservar createdAt.
 *
 * Coincidència (3 criteris):
 * - Comercial (trim, sense accents, case-insensitive)
 * - Dia d'event (DataInici, yyyy-MM-dd)
 * - Ubicació (nom finca sense codi entre parèntesis)
 *
 * Proves: npx ts-node --transpile-only scripts/test-manual-reserve-zoho-match.ts
 */

export interface ManualReserveDoc {
  id: string
  Comercial?: string
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
  Ubicacio: string
  DataInici: string | null
}

export interface ManualReplacementEntry {
  createdAt: string
  mergedFromManualId: string
}

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

export function manualReserveCreatedAtIso(
  manual: ManualReserveDoc
): string | null {
  const raw = manual.createdAt
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = new Date(raw).getTime()
    return Number.isNaN(parsed) ? raw.trim() : new Date(parsed).toISOString()
  }
  if (raw && typeof raw === 'object' && 'toDate' in raw) {
    const date = (raw as { toDate?: () => Date }).toDate?.()
    if (date && !Number.isNaN(date.getTime())) return date.toISOString()
  }
  const legacy = /^spaces_manual_(\d+)$/.exec(manual.id)
  if (legacy) return new Date(Number(legacy[1])).toISOString()
  return null
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
    })
  }

  return {
    byZohoId,
    manualIdsToDelete,
    replacedCount: manualIdsToDelete.length,
  }
}

export function applyManualCreatedAtPreserve(
  data: Record<string, unknown>,
  dealId: string,
  replacements: Map<string, ManualReplacementEntry>,
  existing?: Record<string, unknown>
): Record<string, unknown> {
  const replacement = replacements.get(dealId)
  const out = { ...data }

  const existingMerged = existing?.mergedFromManualId
  const existingCreatedAt =
    existingMerged && existing?.createdAt != null
      ? String(existing.createdAt)
      : null

  const createdAt = existingCreatedAt || replacement?.createdAt
  if (createdAt) {
    out.createdAt = createdAt
  }

  const mergedFromManualId =
    (replacement?.mergedFromManualId as string | undefined) ||
    (existingMerged as string | undefined)
  if (mergedFromManualId) {
    out.mergedFromManualId = mergedFromManualId
  }

  return out
}
