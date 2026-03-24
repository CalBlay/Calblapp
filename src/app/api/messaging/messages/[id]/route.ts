import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

type SessionUser = {
  id: string
  role?: string
}

type MessageRecord = Record<string, unknown> & {
  channelId?: string
  senderId?: string
  imagePath?: string
  body?: string
  createdAt?: number
}

type ChannelMemberRecord = Record<string, unknown> & {
  userId?: string
  unreadCount?: number
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params

  try {
    const msgRef = db.collection('messages').doc(id)
    const snap = await msgRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const msg = snap.data() as MessageRecord
    const channelId = msg?.channelId
    const senderId = msg?.senderId
    const imagePath = msg?.imagePath

    if (senderId !== userId && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const membersSnap = await db
      .collection('channelMembers')
      .where('channelId', '==', channelId)
      .get()

    const memberDocs = membersSnap.docs
    const readRefs = memberDocs.map((d) => {
      const uid = (d.data() as ChannelMemberRecord)?.userId
      return db.collection('messageReads').doc(`${id}_${uid}`)
    })
    const readSnaps = readRefs.length ? await db.getAll(...readRefs) : []
    const readMap = new Map(readSnaps.map((r) => [r.id, r.exists]))

    const batch = db.batch()
    batch.delete(msgRef)

    for (const doc of memberDocs) {
      const data = doc.data() as ChannelMemberRecord
      const uid = data?.userId
      if (!uid || uid === senderId) continue
      const readId = `${id}_${uid}`
      const wasRead = readMap.get(readId)
      if (wasRead) continue
      const current = Number(data?.unreadCount || 0)
      const next = Math.max(0, current - 1)
      batch.set(doc.ref, { unreadCount: next }, { merge: true })
    }

    await batch.commit()

    // Update channel preview if needed
    const channelRef = db.collection('channels').doc(channelId)
    try {
      const latestSnap = await db
        .collection('messages')
        .where('channelId', '==', channelId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get()

      if (!latestSnap.empty) {
        const latest = latestSnap.docs[0].data() as MessageRecord
        const preview = latest?.body ? String(latest.body).slice(0, 180) : 'Imatge'
        await channelRef.set(
          { lastMessagePreview: preview, lastMessageAt: latest.createdAt || 0 },
          { merge: true }
        )
      } else {
        await channelRef.set(
          { lastMessagePreview: '', lastMessageAt: 0 },
          { merge: true }
        )
      }
    } catch {
      // ignore preview errors
    }

    if (imagePath) {
      try {
        await storageAdmin.bucket().file(imagePath).delete()
      } catch {
        // ignore storage errors
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
