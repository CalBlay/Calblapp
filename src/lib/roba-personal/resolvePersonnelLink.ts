import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normDeptLabel } from '@/lib/roba-personal/deptScope'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export type RobaPersonnelLink = {
  personnelId: string
  /** `normDeptLabel` del `personnel` (per filtrar productes com a cap de roba). */
  workerDeptNorm: string
}

function personnelEligible(raw: Record<string, unknown> | undefined): boolean {
  if (!raw) return false
  if (raw.robaWorkerActive === false) return false
  if (raw.robaHasAppUser === false) return false
  return true
}

/**
 * Resol el document `personnel` vinculat a la sessió (mateix id que `users`, o camp `userId`).
 * Només compta si el treballador està actiu per a roba i té usuari d’app (`robaHasAppUser !== false`).
 */
export async function resolveRobaPersonnelLinkForUser(
  sessionUserId: string
): Promise<RobaPersonnelLink | null> {
  const sid = str(sessionUserId)
  if (!sid) return null

  const tryPersonnel = async (personnelId: string): Promise<RobaPersonnelLink | null> => {
    const pid = str(personnelId)
    if (!pid) return null
    const snap = await db.collection('personnel').doc(pid).get()
    if (!snap.exists) return null
    const raw = snap.data() as Record<string, unknown>
    if (!personnelEligible(raw)) return null
    const deptRaw = str(raw.department) || str(raw.departmentLower)
    return { personnelId: pid, workerDeptNorm: normDeptLabel(deptRaw) }
  }

  const direct = await tryPersonnel(sid)
  if (direct) return direct

  const userSnap = await db.collection('users').doc(sid).get()
  if (!userSnap.exists) return null
  const uid = str((userSnap.data() as { userId?: string })?.userId)
  if (!uid || uid === sid) return null
  return tryPersonnel(uid)
}
