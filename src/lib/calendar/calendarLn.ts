import { PERM } from '@/lib/permissionKeys'

export const CALENDAR_LN_OPTIONS = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'casaments', label: 'Casaments' },
  { key: 'grups restaurants', label: 'Grups Restaurants' },
  { key: 'green vita', label: 'Green Vita' },
  { key: 'foodlovers', label: 'Foodlovers' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'altres', label: 'Altres' },
] as const

export const CALENDAR_LN_PERMISSION = {
  create: PERM.action('/menu/calendar', 'manual:create'),
  update: PERM.action('/menu/calendar', 'manual:update'),
} as const

type CalendarLnAssignment = {
  overrides?: Array<{
    permission?: string
    effect?: 'allow' | 'deny'
    scope?: 'client' | 'centre' | 'project'
    scopeId?: string | null
  }>
} | null

export function normalizeCalendarLn(value: unknown): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

  const compact = normalized.replace(/\s+/g, '')
  if (compact === 'grupsrestaurants' || compact === 'restaurants' || compact === 'restauracio') {
    return 'grups restaurants'
  }
  if (compact === 'greenvita') return 'green vita'
  if (compact === 'foodlover' || compact === 'foodlovers') return 'foodlovers'
  return normalized
}

/**
 * Project-scoped allows on a calendar mutation permission act as an LN allowlist.
 * No scoped allows means the existing, unrestricted permission behaviour is kept.
 */
export function calendarLnScopeIdsForPermission(
  assignment: CalendarLnAssignment,
  permission: string
): string[] | null {
  const scopes = (assignment?.overrides || [])
    .filter(
      (override) =>
        override.permission === permission &&
        override.effect === 'allow' &&
        override.scope === 'project'
    )
    .map((override) => normalizeCalendarLn(override.scopeId))
    .filter(Boolean)

  return scopes.length > 0 ? [...new Set(scopes)] : null
}

export function isCalendarLnAllowed(value: unknown, allowedLns: string[] | null | undefined): boolean {
  if (allowedLns == null) return true
  const normalized = normalizeCalendarLn(value)
  return Boolean(normalized) && allowedLns.some((allowed) => normalizeCalendarLn(allowed) === normalized)
}

export function calendarLnOptionsForScope(allowedLns: string[] | null | undefined) {
  if (allowedLns == null) return [...CALENDAR_LN_OPTIONS]
  return CALENDAR_LN_OPTIONS.filter((option) => isCalendarLnAllowed(option.key, allowedLns))
}
