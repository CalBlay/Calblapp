export const SYNTHETIC_DISMISSAL_SCOPES = ['incidents', 'roba_personal'] as const

export type SyntheticDismissalScope = (typeof SYNTHETIC_DISMISSAL_SCOPES)[number]

export const SYNTHETIC_DISMISSAL_ID_LIMIT = 500

export function normalizeSyntheticDismissalScope(
  value: unknown
): SyntheticDismissalScope | null {
  const scope = String(value || '').trim()
  return SYNTHETIC_DISMISSAL_SCOPES.includes(scope as SyntheticDismissalScope)
    ? (scope as SyntheticDismissalScope)
    : null
}

export function normalizeSyntheticDismissalIds(
  value: unknown,
  limit = SYNTHETIC_DISMISSAL_ID_LIMIT
): string[] {
  if (!Array.isArray(value)) return []
  const ids = [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))]
  return Number.isFinite(limit) && limit >= 0 ? ids.slice(0, limit) : ids
}
