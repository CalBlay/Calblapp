import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole, type Role } from '@/lib/roles'
import { normDeptLabel } from '@/lib/roba-personal/deptScope'

export const RRHH_DEPARTMENT_LOWER = 'recursos humans'

export { normDeptLabel }

export type FirestoreUserDoc = {
  department?: string
  departmentLower?: string
  isDepartmentRobaLead?: boolean
  email?: string
}

export async function getUserDoc(userId: string): Promise<FirestoreUserDoc | null> {
  if (!userId) return null
  const snap = await db.collection('users').doc(userId).get()
  if (!snap.exists) return null
  return snap.data() as FirestoreUserDoc
}

export async function userIsRecursosHumans(userId: string): Promise<boolean> {
  const u = await getUserDoc(userId)
  if (!u) return false
  const d = normDeptLabel(u.departmentLower || u.department)
  return d === RRHH_DEPARTMENT_LOWER
}

/** RRHH o administrador (rol de sessió). */
export async function userCanMarkRequestPrepared(
  userId: string,
  sessionRole?: Role
): Promise<boolean> {
  if (sessionRole && normalizeRole(sessionRole) === 'admin') return true
  return userIsRecursosHumans(userId)
}

export async function userCanMarkRequestPickedUp(
  userId: string,
  request: {
    createdByUserId?: string | null
    requestingDepartment?: string
    requestedByWorkerId?: string | null
  },
  sessionRole?: Role,
  opts?: { linkedPersonnelId?: string }
): Promise<boolean> {
  if (!userId) return false
  if (sessionRole && normalizeRole(sessionRole) === 'admin') return true
  if (await userIsRecursosHumans(userId)) return true
  if (String(request.createdByUserId || '').trim() === userId) return true
  const linked = String(opts?.linkedPersonnelId || '').trim()
  const forWorker = String(request.requestedByWorkerId || '').trim()
  if (linked && forWorker && linked === forWorker) return true
  const u = await getUserDoc(userId)
  if (!u?.isDepartmentRobaLead) return false
  const ud = normDeptLabel(u.departmentLower || u.department)
  const rd = normDeptLabel(request.requestingDepartment)
  return ud !== '' && rd !== '' && ud === rd
}

/** Cancel·lació per treballador amb mòdul limitat: només sol·licitud pròpia encara «submitted». */
export function workerSelfCanCancelRobaRequest(input: {
  linkedPersonnelId: string
  userId: string
  request: {
    status?: string
    createdByUserId?: string | null
    requestedByWorkerId?: string | null
  },
}): boolean {
  const st = String(input.request.status || 'submitted').trim()
  if (st !== 'submitted') return false
  const creator = String(input.request.createdByUserId || '').trim()
  const worker = String(input.request.requestedByWorkerId || '').trim()
  const pid = String(input.linkedPersonnelId || '').trim()
  return Boolean(
    (creator && creator === input.userId) || (worker && worker === pid && pid !== '')
  )
}
