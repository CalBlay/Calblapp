import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

type SessionUser = { id?: string; role?: string }

const PILOT_LOCATIONS = [
  { source: 'finques', location: 'Clos la Plana' },
  { source: 'finques', location: 'Josep Massachs' },
  { source: 'finques', location: 'Mirador Events' },
  { source: 'finques', location: 'Font de la Canya' },
  { source: 'finques', location: 'La Masia' },
  { source: 'restaurants', location: 'Mirador' },
  { source: 'restaurants', location: 'Nàutic' },
  { source: 'restaurants', location: 'La Masia' },
  { source: 'restaurants', location: 'Camp Nou' },
  { source: 'restaurants', location: 'Soliver' },
]

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser | undefined
  const role = normalizeRole(user?.role || '')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const batch = db.batch()
    const now = Date.now()

    for (const ch of PILOT_LOCATIONS) {
      const sourceLabel = ch.source === 'finques' ? 'Finques' : 'Restaurants'
      const name = `Ops · ${sourceLabel} · ${ch.location}`
      const docId = `${ch.source}_${slugify(ch.location)}`
      const docRef = db.collection('channels').doc(docId)
      batch.set(
        docRef,
        {
          type: 'manteniment',
          source: ch.source,
          location: ch.location,
          name,
          createdBy: user?.id || 'system',
          createdAt: now,
          lastMessagePreview: '',
          lastMessageAt: 0,
          responsibleUserId: null,
          responsibleUserName: null,
        },
        { merge: true }
      )
    }

    await batch.commit()
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
