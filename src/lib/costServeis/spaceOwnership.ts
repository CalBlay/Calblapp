/**
 * Classificació d’espai (finca pròpia vs centre extern)
 * a partir del catàleg `finques` del mòdul Espais.
 */

export type SpaceKind = 'Propi' | 'Extern'

export const SPACE_KIND_LABELS: Record<SpaceKind, string> = {
  Propi: 'Finca pròpia',
  Extern: 'Centre extern',
}

export type SpaceOwnershipIndex = {
  byId: Map<string, SpaceKind>
  byCode: Map<string, SpaceKind>
  byName: Map<string, SpaceKind>
}

export type SpaceOwnershipLookup = {
  fincaId?: string | null
  fincaCode?: string | null
  ubicacioCode?: string | null
  location?: string | null
  eventName?: string | null
}

function fold(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function nameKey(value: string): string {
  return fold(String(value || '').replace(/\s*\([^)]*\)\s*/g, ' '))
}

function codeFromParens(value: string): string | null {
  const match = String(value || '').match(/\(([^)]+)\)\s*$/)
  const code = match?.[1]?.trim()
  return code || null
}

/** Mateixa regla que Espais: `tipus` explícit, si no CC* → Propi. */
export function classifySpaceKind(rawTipus: string, code: string): SpaceKind {
  const tipus = fold(rawTipus)
  if (tipus === 'propi' || tipus === 'propia') return 'Propi'
  if (tipus === 'extern' || tipus === 'externo') return 'Extern'
  return fold(code).startsWith('cc') ? 'Propi' : 'Extern'
}

export function indexSpaceOwnershipDocs(
  docs: Array<{ id: string; data: Record<string, unknown> }>
): SpaceOwnershipIndex {
  const byId = new Map<string, SpaceKind>()
  const byCode = new Map<string, SpaceKind>()
  const byName = new Map<string, SpaceKind>()

  for (const doc of docs) {
    const d = doc.data || {}
    const code = String(d.code ?? d.codi ?? '').trim()
    const nom = String(d.nom ?? '').trim()
    const kind = classifySpaceKind(String(d.tipus ?? ''), code)
    byId.set(doc.id, kind)
    if (code) byCode.set(fold(code), kind)
    const nk = nameKey(nom)
    if (nk && !byName.has(nk)) byName.set(nk, kind)
  }

  return { byId, byCode, byName }
}

function kindFromCode(
  index: SpaceOwnershipIndex,
  code: string | null | undefined
): SpaceKind | null {
  const raw = String(code || '').trim()
  if (!raw) return null
  return index.byCode.get(fold(raw)) || null
}

function kindFromName(
  index: SpaceOwnershipIndex,
  value: string | null | undefined
): SpaceKind | null {
  const nk = nameKey(String(value || ''))
  if (!nk) return null
  const direct = index.byName.get(nk)
  if (direct) return direct
  for (const [candidate, kind] of index.byName) {
    if (candidate.length < 4) continue
    if (nk.includes(candidate) || candidate.includes(nk)) return kind
  }
  return null
}

export function resolveSpaceKind(
  index: SpaceOwnershipIndex,
  lookup: SpaceOwnershipLookup
): SpaceKind | null {
  const fincaId = String(lookup.fincaId || '').trim()
  if (fincaId && index.byId.has(fincaId)) return index.byId.get(fincaId) || null

  const codes = [
    lookup.fincaCode,
    lookup.ubicacioCode,
    codeFromParens(String(lookup.location || '')),
    codeFromParens(String(lookup.eventName || '')),
  ]
  for (const code of codes) {
    const hit = kindFromCode(index, code)
    if (hit) return hit
  }

  const fromLocationName = kindFromName(index, lookup.location)
  if (fromLocationName) return fromLocationName

  const fromEventName = kindFromName(index, lookup.eventName)
  if (fromEventName) return fromEventName

  const fallbackCode = codes.find((c) => String(c || '').trim())
  if (fallbackCode) return classifySpaceKind('', String(fallbackCode))
  return null
}
