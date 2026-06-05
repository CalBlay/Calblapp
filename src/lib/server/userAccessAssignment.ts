import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole, type Role } from '@/lib/roles'
import type { AssignmentOverride } from '@/lib/permissions/types'

type SaveAssignmentParams = {
  userId: string
  role: string
  department: string
  overrides?: AssignmentOverride[]
  updatedBy: string
}

function parseOverrideInput(raw: unknown): AssignmentOverride | null {
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

export async function saveUserAccessAssignment({
  userId,
  role,
  department,
  overrides = [],
  updatedBy,
}: SaveAssignmentParams): Promise<void> {
  const id = String(userId || '').trim()
  if (!id) throw new Error('userId required')

  const baseRole = normalizeRole(role) as Role
  const departmentTrimmed = String(department || '').trim()

  const parsedOverrides = overrides
    .map(parseOverrideInput)
    .filter((o): o is AssignmentOverride => o != null)

  const ref = firestoreAdmin.collection('user_access_assignments').doc(id)
  await ref.set(
    {
      userId: id,
      base: { role: baseRole, department: departmentTrimmed || null },
      permissionSets: [],
      overrides: parsedOverrides,
      updatedAt: new Date().toISOString(),
      updatedBy,
    },
    { merge: true }
  )
}
