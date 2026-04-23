// src/services/userService.server.ts
import 'server-only'

export type UserAlias = {
  authId: string
  name?: string
  aliases?: string[]
  department?: string
  role?: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
}

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sense diacrítics
    .toLowerCase()
    .trim()
}

/** Heurística: si sembla un nom curt "humà", el tractem com a nom directament */
function looksLikeName(q: string): boolean {
  if (!q) return false
  if (q.length > 40) return false
  // només lletres, espais, . - '
  return /^[A-Za-zÀ-ÖØ-öø-ÿ\s.\-']+$/.test(q)
}

/** Llegeix col·lecció 'users' a Firestore i resol UID→{name,aliases…}.
 *  Estructura recomanada del doc:
 *    { authId: string, name?: string, aliases?: string[], department?: string, role?: 'Admin'|'Direcció'|'Cap Departament'|'Treballador' }
 */
export async function resolveWorkerAlias(authIdOrName: string): Promise<UserAlias | null> {
  const q = String(authIdOrName || '').trim()
  if (!q) return null

  // Si sembla un nom humà -> torna'l com a nom (sense tocar Firestore)
  if (looksLikeName(q)) {
    const val = q.trim()
    return { authId: val, name: val, aliases: [val] }
  }

  // Intent Firestore
  try {
    const { getFirestore } = await import('firebase-admin/firestore')
    const admin = await import('firebase-admin')
    if (admin.apps.length === 0) admin.initializeApp({})
    const db = getFirestore()

    // Cerca per authId (UID)
    const snap = await db.collection('users').where('authId', '==', q).limit(1).get()
    if (!snap.empty) {
      const d = snap.docs[0].data() || {}
      const out: UserAlias = {
        authId: String(d.authId || q),
        name: d.name ? String(d.name) : undefined,
        aliases: Array.isArray(d.aliases) ? d.aliases.map(String) : undefined,
        department: d.department ? String(d.department).toLowerCase() : undefined,
        role: d.role,
      }
      return out
    }

    // (Opcional) també podries buscar per àlies:
    // const snap2 = await db.collection('users').where('aliases','array-contains', q).limit(1).get()
    // ...

  } catch {
    // sense admin configurat → seguim al fallback
  }

  // Fallback local provisional (exemple; adapta’l a la teva realitat)
  const LOCAL: UserAlias[] = [
    { authId: '90KihhI3rk8IQkhSgZEK', name: 'Carata', aliases: ['Carata', 'Carlos'], department: 'logistica', role: 'Treballador' },
  ]
  const byId = LOCAL.find(u => u.authId === q)
  if (byId) return byId

  // Si ens passen un nom aquí (no UID) i no hi ha doc, torna’l com a nom tal qual
  if (looksLikeName(q)) return { authId: q, name: q, aliases: [q] }

  return { authId: q } // com a mínim retorna el mateix UID
}

/** Normalitza rols lliures a la taxonomia oficial (per si t’és útil a rutes API) */
export function normalizeRoleLoose(role?: string): 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador' {
  const r = norm(role || '')
  if (r.startsWith('admin')) return 'Admin'
  if (r.includes('dire')) return 'Direcció'
  if (r.includes('cap')) return 'Cap Departament'
  return 'Treballador'
}
