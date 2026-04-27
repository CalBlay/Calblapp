/** Mateixa lògica que `normalizeDept` a `/api/auditoria/executions` (client + prefetch). */
export type AuditApiDepartment = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'
export type CommercialAuditGroupDepartment = 'empresa' | 'casaments' | 'foodlovers'

const normalizeText = (raw?: string | null) => {
  const base = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  return base.replace(/\s+/g, ' ')
}

export function normalizeAuditDepartment(raw?: string | null): AuditApiDepartment | null {
  const value = normalizeText(raw)
  if (value === 'comercial') return 'comercial'
  if (value === 'serveis' || value === 'sala') return 'serveis'
  if (value === 'cuina') return 'cuina'
  if (value === 'logistica') return 'logistica'
  if (value === 'deco' || value === 'decoracio' || value === 'decoracions') return 'deco'
  return null
}

export function normalizeCommercialAuditGroup(raw?: string | null): CommercialAuditGroupDepartment | null {
  const value = normalizeText(raw).replace(/\s+/g, '')
  if (value === 'empresa') return 'empresa'
  if (value === 'casaments' || value === 'casament') return 'casaments'
  if (value === 'foodlover' || value === 'foodlovers') return 'foodlovers'
  return null
}

export function resolveAuditDepartmentForUser(rawDepartment?: string | null): AuditApiDepartment | null {
  return normalizeAuditDepartment(rawDepartment) || (normalizeCommercialAuditGroup(rawDepartment) ? 'comercial' : null)
}
