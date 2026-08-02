import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { ensureEventChatChannel } from '@/lib/messaging/eventChat'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = { id: string; role?: string; name?: string; department?: string }

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { eventId?: string }
  const eventId = String(body?.eventId || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const role = normalizeRole(user.role || '')
  const channelId = `event_${eventId}`

  const [channelSnap, memberSnap] = await Promise.all([
    db.collection('channels').doc(channelId).get(),
    db
      .collection('channelMembers')
      .where('channelId', '==', channelId)
      .where('userId', '==', userId)
      .limit(1)
      .get(),
  ])

  if (
    channelSnap.exists &&
    (channelSnap.data() as { status?: string } | undefined)?.status !== 'archived' &&
    !memberSnap.empty
  ) {
    return NextResponse.json({ channelId })
  }

  const result = await ensureEventChatChannel(eventId)
  if (!result?.channelId) {
    return NextResponse.json({ error: 'Event not eligible' }, { status: 400 })
  }

  const ensuredMemberSnap =
    result.channelId === channelId && !memberSnap.empty
      ? memberSnap
      : await db
          .collection('channelMembers')
          .where('channelId', '==', result.channelId)
          .where('userId', '==', userId)
          .limit(1)
          .get()

  if (ensuredMemberSnap.empty) {
    const memberIds = Array.isArray(result.memberIds) ? result.memberIds : []
    const canForce = role === 'admin' || role === 'direccio'
    if (memberIds.includes(userId) || canForce) {
      await db
        .collection('channelMembers')
        .doc(`${result.channelId}_${userId}`)
        .set(
          {
            channelId: result.channelId,
            userId,
            userName: user.name || '',
            role: 'member',
            joinedAt: Date.now(),
            unreadCount: 0,
          },
          { merge: true }
        )
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.json({ channelId: result.channelId })
}
