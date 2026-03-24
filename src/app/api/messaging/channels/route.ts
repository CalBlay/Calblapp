import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  role?: string
  name?: string
}

type ChannelRecord = Record<string, unknown> & {
  lastMessageAt?: number
}

type ChannelMemberRecord = Record<string, unknown> & {
  channelId?: string
  unreadCount?: number
  muted?: boolean
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const role = normalizeRole(user.role || '')

  const { searchParams } = new URL(req.url)
  const scope = (searchParams.get('scope') || 'mine').toLowerCase()

  try {
    if (scope === 'all') {
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const snap = await db.collection('channels').get()
      const channels = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ChannelRecord) }))
      return NextResponse.json({ channels })
    }

    // scope: mine
    const memberSnap = await db
      .collection('channelMembers')
      .where('userId', '==', userId)
      .get()

    const memberships = memberSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as ChannelMemberRecord),
    }))

    const channelIds = memberships.map((m) => m.channelId).filter(Boolean)
    if (channelIds.length === 0) {
      return NextResponse.json({ channels: [] })
    }

    const channelRefs = channelIds.map((id) => db.collection('channels').doc(id))
    const channelSnaps = await db.getAll(...channelRefs)
    const channelMap = new Map(
      channelSnaps
        .filter((c) => c.exists)
        .map((c) => [c.id, { id: c.id, ...(c.data() as ChannelRecord) }])
    )

    const channels = memberships
      .map((m) => {
        const c = channelMap.get(m.channelId)
        if (!c) return null
        return {
          ...c,
          unreadCount: Number(m.unreadCount || 0),
          muted: Boolean(m.muted),
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const av = typeof a.lastMessageAt === 'number' ? a.lastMessageAt : 0
        const bv = typeof b.lastMessageAt === 'number' ? b.lastMessageAt : 0
        return bv - av
      })

    return NextResponse.json({ channels })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
