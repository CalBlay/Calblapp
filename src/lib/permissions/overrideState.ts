import type { AssignmentOverride } from '@/lib/permissions/types'

export function getClientOverrideEffect(
  overrides: AssignmentOverride[],
  permission: string
): 'allow' | 'deny' | null {
  const found = overrides.find(
    (o) => o.permission === permission && (o.scope || 'client') === 'client' && !o.scopeId
  )
  return found ? found.effect : null
}

export function effectiveAllowed(
  overrides: AssignmentOverride[],
  permission: string,
  baseAllowed: boolean
): boolean {
  const o = getClientOverrideEffect(overrides, permission)
  if (o === 'deny') return false
  if (o === 'allow') return true
  return baseAllowed
}

export function applyOverrideEffect(
  overrides: AssignmentOverride[],
  permission: string,
  effect: 'allow' | 'deny' | null,
  note = 'UI matrix'
): AssignmentOverride[] {
  const next = overrides.filter(
    (o) => !(o.permission === permission && (o.scope || 'client') === 'client' && !o.scopeId)
  )
  if (!effect) return next
  return [
    ...next,
    {
      permission,
      effect,
      scope: 'client',
      scopeId: null,
      note,
    },
  ]
}

export function applyOverrideEffects(
  overrides: AssignmentOverride[],
  updates: Array<{ permission: string; effect: 'allow' | 'deny' | null }>,
  note = 'UI matrix'
): AssignmentOverride[] {
  return updates.reduce(
    (acc, { permission, effect }) => applyOverrideEffect(acc, permission, effect, note),
    overrides
  )
}
