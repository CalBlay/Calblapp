import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { MODULES } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

type BootstrapResult = {
  ok: true
  usersProcessed: number
  usersWritten: number
  defaultsWritten: boolean
}

/**
 * Inicialitza la configuració per defecte de permisos basant-se en la lògica actual:
 * - `MODULES` (visibilitat per rol/departament)
 * - rols/departaments dels usuaris a Firestore `users`
 *
 * Guardem:
 * - `permissions_defaults/v1` amb el catàleg base (mòduls/submòduls)
 * - `user_access_assignments/{userId}` amb rol base + dept + overrides buits
 */
export async function POST() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const defaultsRef = firestoreAdmin.collection('permissions_defaults').doc('v1')
  const existingDefaults = await defaultsRef.get()
  let defaultsWritten = false
  if (!existingDefaults.exists) {
    await defaultsRef.set({
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
      modules: MODULES,
    })
    defaultsWritten = true
  }

  const usersSnap = await firestoreAdmin.collection('users').get()
  const users = usersSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as Array<{ id: string; role?: unknown; department?: unknown }>

  const assignmentsCol = firestoreAdmin.collection('user_access_assignments')
  let usersWritten = 0
  let batch = firestoreAdmin.batch()
  let batchOps = 0

  for (const u of users) {
    const userId = String(u.id || '').trim()
    if (!userId) continue

    const role = normalizeRole(typeof u.role === 'string' ? u.role : undefined)
    const department = typeof u.department === 'string' ? u.department : undefined

    const ref = assignmentsCol.doc(userId)
    batch.set(
      ref,
      {
        userId,
        base: {
          role,
          department: department ?? null,
        },
        permissionSets: [],
        overrides: [],
        updatedAt: new Date().toISOString(),
        updatedBy: auth.user.id,
      },
      { merge: true }
    )

    usersWritten += 1
    batchOps += 1
    if (batchOps >= 400) {
      await batch.commit()
      batch = firestoreAdmin.batch()
      batchOps = 0
    }
  }

  if (batchOps > 0) {
    await batch.commit()
  }

  const res: BootstrapResult = {
    ok: true,
    usersProcessed: users.length,
    usersWritten,
    defaultsWritten,
  }
  return NextResponse.json(res)
}
