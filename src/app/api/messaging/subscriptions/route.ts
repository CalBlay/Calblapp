import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
}

type UserRecord = Record<string, unknown> & {
  opsChannelsConfigurable?: string[]
  opsEventsConfigurable?: boolean
  opsEventsEnabled?: boolean
  opsProjectsConfigurable?: boolean
  name?: string
}

type ChannelRecord = Record<string, unknown> & {
  source?: string
}

type ChannelMemberRecord = Record<string, unknown> & {
  channelId?: string
}

const ALLOWED_SOURCES = new Set(['finques', 'restaurants', 'events', 'projects'])

async function getAllowedChannelIds(userId: string): Promise<string[]> {
  const userSnap = await db.collection('users').doc(userId).get()
  if (!userSnap.exists) return []
  const data = userSnap.data() as UserRecord
  const ids = Array.isArray(data?.opsChannelsConfigurable)
    ? data.opsChannelsConfigurable.map(String).filter(Boolean)
    : []
  return ids
}

async function getEventsFlags(userId: string): Promise<{ configurable: boolean; enabled: boolean }> {
  const userSnap = await db.collection('users').doc(userId).get()
  if (!userSnap.exists) return { configurable: false, enabled: false }
  const data = userSnap.data() as UserRecord
  const configurable = Boolean(data?.opsEventsConfigurable)
  const enabled = configurable ? Boolean(data?.opsEventsEnabled) : false
  return { configurable, enabled }
}

async function getProjectsConfigurable(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get()
  if (!userSnap.exists) return true
  const data = userSnap.data() as UserRecord
  return typeof data?.opsProjectsConfigurable === 'boolean'
    ? Boolean(data.opsProjectsConfigurable)
    : true
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('userId') || user.id

  if (targetUserId !== user.id && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const allowedIds = await getAllowedChannelIds(targetUserId)
    const eventsFlags = await getEventsFlags(targetUserId)
    const projectsConfigurable = await getProjectsConfigurable(targetUserId)
    const isAdminTarget = role === 'admin' && targetUserId === user.id

    if (!isAdminTarget && allowedIds.length === 0 && !eventsFlags.configurable && !projectsConfigurable) {
      return NextResponse.json({
        channels: [],
        eventsConfigurable: eventsFlags.configurable,
        eventsEnabled: eventsFlags.enabled,
        projectsConfigurable,
      })
    }

    const [channelsSnap, memberSnap] = await Promise.all([
      db.collection('channels').get(),
      db.collection('channelMembers').where('userId', '==', targetUserId).get(),
    ])

    const subscribed = new Set(
      memberSnap.docs.map((d) => (d.data() as ChannelMemberRecord).channelId).filter(Boolean)
    )

    const channels = channelsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as ChannelRecord) }))
      .filter((ch) => ALLOWED_SOURCES.has(String(ch.source || '')))
      .filter((ch) => {
        const source = String(ch.source || '')
        if (isAdminTarget) return true
        if (source === 'events') return eventsFlags.configurable
        if (source === 'projects') return projectsConfigurable
        return allowedIds.includes(String(ch.id))
      })
      .map((ch) => ({
        ...ch,
        subscribed: subscribed.has(ch.id),
      }))

    return NextResponse.json({
      channels,
      eventsConfigurable: isAdminTarget ? true : eventsFlags.configurable,
      eventsEnabled: isAdminTarget ? true : eventsFlags.enabled,
      projectsConfigurable: isAdminTarget ? true : projectsConfigurable,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')

  try {
    const body = (await req.json()) as {
      channelIds?: string[]
      userId?: string
      eventsEnabled?: boolean
    }
    const targetUserId = body.userId || user.id
    if (targetUserId !== user.id && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const allowedIds = await getAllowedChannelIds(targetUserId)
    const isAdminTarget = role === 'admin' && targetUserId === user.id
    const allowedSet = new Set(allowedIds)
    const eventsFlags = await getEventsFlags(targetUserId)
    const projectsConfigurable = await getProjectsConfigurable(targetUserId)

    const targetUserSnap = await db.collection('users').doc(targetUserId).get()
    const targetUserName = (targetUserSnap.data() as UserRecord | undefined)?.name || ''
    const channelIds = Array.isArray(body.channelIds)
      ? body.channelIds.map(String).filter(Boolean)
      : []
    const allowedChannelsSnap = await db.collection('channels').get()
    const channelsById = new Map(
      allowedChannelsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() as ChannelRecord) }])
    )
    let filteredChannelIds = channelIds.filter((id) => {
      const channel = channelsById.get(id)
      if (!channel) return false
      const source = String(channel.source || '')
      if (!ALLOWED_SOURCES.has(source)) return false
      if (allowedSet.has(id)) return true
      return source === 'projects' && projectsConfigurable
    })
    if (isAdminTarget) {
      const allowedChannelIds = new Set(
        allowedChannelsSnap.docs
          .map((doc) => ({ id: doc.id, ...(doc.data() as ChannelRecord) }))
          .filter((channel) => ALLOWED_SOURCES.has(String(channel.source || '')) && String(channel.source || '') !== 'events')
          .map((channel) => String(channel.id))
      )
      filteredChannelIds = channelIds.filter((id) => allowedChannelIds.has(id))
    }
    const eventsEnabled =
      typeof body.eventsEnabled === 'boolean' && (eventsFlags.configurable || isAdminTarget)
        ? body.eventsEnabled
        : eventsFlags.enabled

    if (eventsFlags.configurable || isAdminTarget) {
      await db
        .collection('users')
        .doc(targetUserId)
        .set({ opsEventsEnabled: eventsEnabled }, { merge: true })
    }

    const memberSnap = await db
      .collection('channelMembers')
      .where('userId', '==', targetUserId)
      .get()

    const existing = new Set(
      memberSnap.docs
        .map((d) => (d.data() as ChannelMemberRecord).channelId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
    const next = new Set(filteredChannelIds)
    if (eventsFlags.configurable || isAdminTarget) {
      const eventMemberIds = memberSnap.docs
        .map((d) => (d.data() as ChannelMemberRecord)?.channelId)
        .filter((id): id is string => typeof id === 'string' && id.startsWith('event_'))

      if (eventsEnabled) {
        eventMemberIds.forEach((id) => next.add(id))
      } else {
        eventMemberIds.forEach((id) => next.delete(id))
      }
    }

    const batch = db.batch()

    // Remove old
    memberSnap.docs.forEach((doc) => {
      const chId = (doc.data() as ChannelMemberRecord).channelId
      if (!chId) return
      if (!next.has(chId)) {
        batch.delete(doc.ref)
      }
    })

    // Add new
    for (const chId of filteredChannelIds) {
      if (existing.has(chId)) continue
      const ref = db.collection('channelMembers').doc(`${chId}_${targetUserId}`)
      batch.set(ref, {
        channelId: chId,
        userId: targetUserId,
        userName: targetUserName,
        role: 'member',
        joinedAt: Date.now(),
        unreadCount: 0,
      })
    }

    await batch.commit()

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
