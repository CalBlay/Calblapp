import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { Query } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SessionUser {
  id: string
  role?: string
}

type NotificationFirestoreDoc = Record<string, unknown> & {
  createdAt?: number
  read?: boolean
  type?: string
}

type NotificationListItem = { id: string } & NotificationFirestoreDoc

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as SessionUser).id
  if (!userId) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'count'
  const type = (searchParams.get('type') || '').trim()

  try {
    const notificationsRef = db
      .collection('users')
      .doc(userId)
      .collection('notifications')
    let baseRef: Query = notificationsRef

    if (type) {
      baseRef = baseRef.where('type', '==', type)
    }

    if (mode === 'count') {
      const snap = await baseRef.where('read', '==', false).get()
      return NextResponse.json({ count: snap.size })
    }

    let listDocs: NotificationListItem[] = []
    if (type) {
      const listSnap = await baseRef.limit(200).get()
      listDocs = listSnap.docs.map((d) => {
        const data = d.data() as NotificationFirestoreDoc
        return { id: d.id, ...data }
      })
      listDocs.sort((a, b) => {
        const av = typeof a.createdAt === 'number' ? a.createdAt : 0
        const bv = typeof b.createdAt === 'number' ? b.createdAt : 0
        return bv - av
      })
      listDocs = listDocs.slice(0, 50)
    } else {
      const listSnap = await baseRef.orderBy('createdAt', 'desc').limit(50).get()
      listDocs = listSnap.docs.map((d) => {
        const data = d.data() as NotificationFirestoreDoc
        return { id: d.id, ...data }
      })
    }
    return NextResponse.json({ notifications: listDocs })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as SessionUser).id
  if (!userId) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
  }

  try {
    const body = (await req.json()) as { action?: string; type?: string; notificationId?: string }
    const action = body.action || ''
    const type = (body.type || '').trim()
    const notificationId = (body.notificationId || '').trim()

    const notificationsRef = db
      .collection('users')
      .doc(userId)
      .collection('notifications')
    let baseRef: Query = notificationsRef

    if (type) {
      baseRef = baseRef.where('type', '==', type)
    }

    if (action === 'markAllRead') {
      const snap = await baseRef.where('read', '==', false).get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.update(d.ref, { read: true }))
      await batch.commit()
      return NextResponse.json({ success: true })
    }

    if (action === 'markRead') {
      if (!notificationId) {
        return NextResponse.json({ error: 'notificationId required' }, { status: 400 })
      }
      await db
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .doc(notificationId)
        .set({ read: true }, { merge: true })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
