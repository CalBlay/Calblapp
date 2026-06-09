import { firestoreAdmin } from '@/lib/firebaseAdmin'
import type { AppUserRow } from '@/lib/incidentMeetingAttendees'

export async function loadAllAppUsers(includeWithoutEmail = false): Promise<AppUserRow[]> {
  const snap = await firestoreAdmin.collection('users').get()
  const rows: AppUserRow[] = []
  const seenEmails = new Set<string>()
  const seenIds = new Set<string>()

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>
    const email = String(data.email || '').trim().toLowerCase()
    const name = String(data.name || '').trim() || email || doc.id
    if (!name) continue
    if (seenIds.has(doc.id)) continue
    if (email.includes('@')) {
      if (seenEmails.has(email)) continue
      seenEmails.add(email)
    } else if (!includeWithoutEmail) {
      continue
    }
    seenIds.add(doc.id)
    rows.push({
      id: doc.id,
      name,
      email,
      department: String(data.department || '').trim(),
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'ca'))
  return rows
}

export async function loadAllAppUsersWithEmail(): Promise<AppUserRow[]> {
  return loadAllAppUsers(false)
}
