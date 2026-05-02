import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { buildWorkerCodeFromName, randWorkerSuffix } from '@/lib/roba-personal/workerCodeFormat'

const COL = DOTACIO_COLLECTIONS.workers

export { buildWorkerCodeFromName } from '@/lib/roba-personal/workerCodeFormat'

/** Genera un `workerCode` que no està en ús (reintents si cal). */
export async function allocateUniqueWorkerCode(name: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const c = buildWorkerCodeFromName(name)
    if (!(await workerCodeTaken(c))) return c
  }
  return `persona-${Date.now().toString(36)}-${randWorkerSuffix(3)}`
}

/** Codi de treballador (roba) emmagatzemat com a `workerCode` al document `personnel`. */
export async function workerCodeTaken(
  code: string,
  excludeId?: string
): Promise<boolean> {
  const c = String(code ?? '').trim()
  if (!c) return false
  const q = await db.collection(COL).where('workerCode', '==', c).limit(5).get()
  if (q.docs.some((d) => d.id !== excludeId)) return true
  const legacy = await db.collection(COL).where('code', '==', c).limit(5).get()
  return legacy.docs.some((d) => d.id !== excludeId)
}
