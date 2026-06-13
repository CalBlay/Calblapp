import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getSiteAndDrive, getGraphToken } from '@/services/sharepoint/graph'

const normName = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

async function lookupUserIdByPersonnelId(personnelId: string) {
  const userDoc = await db.collection('users').doc(personnelId).get()
  return userDoc.exists ? userDoc.id : null
}

export async function resolveEmailByName(name?: string | null): Promise<string> {
  const rawName = String(name || '').trim()
  if (!rawName) return ''

  let snap = await db.collection('users').where('name', '==', rawName).limit(1).get()
  if (!snap.empty) {
    const email = String(snap.docs[0].data()?.email || '').trim()
    if (email.includes('@')) return email
  }

  const folded = normName(rawName)
  snap = await db.collection('users').where('nameFold', '==', folded).limit(1).get()
  if (!snap.empty) {
    const email = String(snap.docs[0].data()?.email || '').trim()
    if (email.includes('@')) return email
  }

  snap = await db.collection('personnel').where('name', '==', rawName).limit(1).get()
  if (!snap.empty) {
    const data = snap.docs[0].data() as { email?: string | null }
    const email = String(data.email || '').trim()
    if (email.includes('@')) return email
    const uid = await lookupUserIdByPersonnelId(snap.docs[0].id)
    if (uid) {
      const userSnap = await db.collection('users').doc(uid).get()
      const userEmail = String(userSnap.data()?.email || '').trim()
      if (userEmail.includes('@')) return userEmail
    }
  }

  snap = await db.collection('personnel').where('nameFold', '==', folded).limit(1).get()
  if (!snap.empty) {
    const data = snap.docs[0].data() as { email?: string | null }
    const email = String(data.email || '').trim()
    if (email.includes('@')) return email
    const uid = await lookupUserIdByPersonnelId(snap.docs[0].id)
    if (uid) {
      const userSnap = await db.collection('users').doc(uid).get()
      const userEmail = String(userSnap.data()?.email || '').trim()
      if (userEmail.includes('@')) return userEmail
    }
  }

  return ''
}

export async function resolveEmailsByNames(names: string[]) {
  const unique = Array.from(
    new Set(names.map((name) => String(name || '').trim()).filter(Boolean))
  )
  const entries = await Promise.all(
    unique.map(async (name) => ({
      name,
      email: await resolveEmailByName(name),
    }))
  )
  return entries
}

export function parseSharePointItemId(url: string): string | null {
  const raw = String(url || '').trim()
  if (!raw) return null
  try {
    const parsed = raw.startsWith('http')
      ? new URL(raw)
      : new URL(raw, 'http://local.invalid')
    if (!parsed.pathname.includes('/api/sharepoint/file')) return null
    const itemId = parsed.searchParams.get('itemId')
    return itemId ? String(itemId).trim() : null
  } catch {
    return null
  }
}

export function fileNameFromUrl(url: string, fallback = 'document') {
  const itemId = parseSharePointItemId(url)
  if (itemId) return fallback
  try {
    const parsed = url.startsWith('http')
      ? new URL(url)
      : new URL(url, 'http://local.invalid')
    const last = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim()
    return last || fallback
  } catch {
    return fallback
  }
}

export async function getSharePointFileMeta(itemId: string) {
  const { driveId } = await getSiteAndDrive()
  const { access_token } = await getGraphToken()

  const metaRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}`,
    {
      headers: { Authorization: `Bearer ${access_token}` },
      cache: 'no-store',
    }
  )
  if (!metaRes.ok) {
    throw new Error(`No s'ha pogut llegir el fitxer de SharePoint (${metaRes.status})`)
  }
  const meta = (await metaRes.json()) as { name?: string; file?: { mimeType?: string } }
  return {
    name: String(meta.name || '').trim() || 'document',
    contentType: String(meta.file?.mimeType || 'application/octet-stream'),
  }
}

export async function downloadSharePointFile(itemId: string) {
  const { driveId } = await getSiteAndDrive()
  const { access_token } = await getGraphToken()
  const meta = await getSharePointFileMeta(itemId)

  const fileRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`,
    {
      headers: { Authorization: `Bearer ${access_token}` },
      cache: 'no-store',
    }
  )
  if (!fileRes.ok) {
    throw new Error(`No s'ha pogut descarregar el fitxer de SharePoint (${fileRes.status})`)
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  return {
    name: meta.name,
    contentType: String(fileRes.headers.get('content-type') || meta.contentType || 'application/octet-stream'),
    contentBytesBase64: buffer.toString('base64'),
  }
}

export async function findSenderEmail(user: { id: string; email?: string | null }) {
  const direct = String(user.email || '').trim()
  if (direct.includes('@')) return direct

  const snap = await db.collection('users').doc(user.id).get()
  if (snap.exists) {
    const email = String(snap.data()?.email || '').trim()
    if (email.includes('@')) return email
  }

  const byUserIdSnap = await db.collection('users').where('userId', '==', user.id).limit(1).get()
  if (!byUserIdSnap.empty) {
    const email = String(byUserIdSnap.docs[0].data()?.email || '').trim()
    if (email.includes('@')) return email
  }

  return ''
}
