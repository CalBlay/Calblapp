/** Mateixa lògica que `normalizeDept` a `/api/auditoria/executions` (client + prefetch). */
export type AuditApiDepartment = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

export function normalizeAuditDepartment(raw?: string | null): AuditApiDepartment | null {
  const value = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'comercial') return 'comercial'
  if (value === 'serveis' || value === 'sala') return 'serveis'
  if (value === 'cuina') return 'cuina'
  if (value === 'logistica') return 'logistica'
  if (value === 'deco' || value === 'decoracio' || value === 'decoracions') return 'deco'
  return null
}
