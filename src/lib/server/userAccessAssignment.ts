import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { parseOverrideInput } from '@/lib/permissions/parseOverrideInput'
import type { AssignmentOverride } from '@/lib/permissions/types'
import { normalizeRole, type Role } from '@/lib/roles'

type SaveAssignmentParams = {
  userId: string
  role: string
  department: string
  overrides?: AssignmentOverride[]
  updatedBy: string
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
