import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeDept } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

/** Caps de departament Compres (dades del mòdul Usuaris). */
export type CompresCapRecipient = {
  id: string
  name: string
  email: string | null
  department: string
}

const COMPRES_DEPT = 'compres'

export async function listCompresCapRecipients(): Promise<CompresCapRecipient[]> {
  const snap = await db.collection('users').get()
  const out: CompresCapRecipient[] = []

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    const role = normalizeRole(String(data.role || ''))
    const deptNorm = normalizeDept(String(data.department || ''))
    if (role !== 'cap') continue
    if (deptNorm !== COMPRES_DEPT) continue

    const emailRaw = String(data.email || '').trim()
    out.push({
      id: d.id,
      name: String(data.name || '').trim(),
      email: emailRaw || null,
      department: String(data.department || '').trim(),
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
  return out
}

/** Adreces vàlides per al camp To del correu (una o més caps amb email). */
export function joinRecipientEmails(recipients: CompresCapRecipient[]): string {
  const emails = recipients.map((r) => r.email).filter((e): e is string => Boolean(e))
  return [...new Set(emails)].join(', ')
}
