import type { AssignmentOverride } from '@/lib/permissions/types'

/** Sanitize a permission override from admin JSON / assignment payloads. */
export function parseOverrideInput(raw: unknown): AssignmentOverride | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const permission = String(o.permission ?? '').trim()
  if (!permission) return null
  const effect: AssignmentOverride['effect'] =
    String(o.effect ?? 'allow') === 'deny' ? 'deny' : 'allow'
  const scopeRaw = String(o.scope ?? 'client')
  const scope: AssignmentOverride['scope'] =
    scopeRaw === 'centre' || scopeRaw === 'project' ? scopeRaw : 'client'
  const scopeId =
    o.scopeId != null && o.scopeId !== '' ? String(o.scopeId).trim() : null
  const note = o.note != null && o.note !== '' ? String(o.note).trim() : null
  return { permission, effect, scope, scopeId, note }
}
