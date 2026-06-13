export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { buildGeneralRoomId, buildAutoGeneralRoom } from '@/lib/projectGeneralRoom'
import { canAccessBlockRoom, canAccessGeneralRoom } from '@/lib/projectRoomAccess'
import { sessionToRoomAccessUser } from '@/lib/projectAccess'
import { buildProjectRoomChannelId } from '@/lib/projectRoomOps'

type SessionUser = {
  id: string
  name?: string
  role?: string
}

type RoomSummary = {
  roomId: string
  roomName: string
  roomKind: 'general' | 'block'
  blockId: string
  opsChannelId: string
  unreadCount: number
  hasMessagesToRead: boolean
  lastMessagePreview: string
  lastMessageAt: number
  lastSenderName: string
}

type FeedItem = {
  roomId: string
  roomName: string
  roomKind: 'general' | 'block'
  blockId: string
  messageId: string
  senderName: string
  bodyPreview: string
  createdAt: number
}

function resolveProjectRooms(data: Record<string, unknown>, projectId: string) {
  const stored = Array.isArray(data.rooms) ? [...(data.rooms as Record<string, unknown>[])] : []
  const generalId = buildGeneralRoomId(projectId)
  const hasGeneral = stored.some((room) => String(room.id || '') === generalId)

  const maybeGeneralRoom = hasGeneral
    ? null
    : buildAutoGeneralRoom({ ...data, id: projectId }, projectId)
  const rooms: Record<string, unknown>[] = hasGeneral
    ? stored
    : maybeGeneralRoom
      ? [maybeGeneralRoom as Record<string, unknown>, ...stored]
      : stored

  const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : []
  for (const block of blocks) {
    const blockId = String(block.id || '')
    if (!blockId) continue
    const roomId = `room-block-${blockId}`
    if (rooms.some((room) => String(room.id || '') === roomId)) continue
    const tasks = Array.isArray(block.tasks) ? (block.tasks as Record<string, unknown>[]) : []
    rooms.push({
      id: roomId,
      name: String(block.name || 'Sala de bloc'),
      kind: 'block',
      blockId,
      participants: [
        ...new Set(
          [
            String(data.owner || ''),
            String(block.owner || ''),
            ...tasks.map((task) => String(task.owner || '')),
          ].filter(Boolean)
        ),
      ],
    })
  }

  return { rooms, blocks }
}

function canAccessRoom(
  user: SessionUser,
  data: Record<string, unknown>,
  room: Record<string, unknown>,
  blocks: Record<string, unknown>[],
  projectId: string
) {
  const project = {
    owner: String(data.owner || ''),
    ownerUserId: String(data.ownerUserId || ''),
    sponsor: String(data.sponsor || ''),
    createdById: String(data.createdById || ''),
  }
  const accessUser = sessionToRoomAccessUser(user)
  const participants = Array.isArray(room.participants)
    ? (room.participants as unknown[]).map(String)
    : []
  const roomId = String(room.id || '')
  const kind = String(room.kind || '')

  if (kind === 'general' || roomId === buildGeneralRoomId(projectId)) {
    return canAccessGeneralRoom(
      accessUser,
      project,
      blocks.map((block) => ({ owner: String(block.owner || '') })),
      { participants, kind }
    )
  }

  const blockId = String(room.blockId || '')
  const block = blocks.find((item) => String(item.id || '') === blockId)
  const tasks = block && Array.isArray(block.tasks) ? (block.tasks as Record<string, unknown>[]) : []

  return canAccessBlockRoom(
    accessUser,
    project,
    block
      ? {
          owner: String(block.owner || ''),
          tasks: tasks.map((task) => ({ owner: String(task.owner || '') })),
        }
      : null,
    { participants, kind }
  )
}

async function fetchMemberDocsByChannelIds(userId: string, channelIds: string[]) {
  const uniqueIds = [...new Set(channelIds.map(String).filter(Boolean))]
  if (uniqueIds.length === 0) return new Map<string, Record<string, unknown>>()

  const memberByChannelId = new Map<string, Record<string, unknown>>()
  const chunkSize = 30

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize)
    const snap = await db
      .collection('channelMembers')
      .where('userId', '==', userId)
      .where('channelId', 'in', chunk)
      .get()

    snap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      const channelId = String(data.channelId || '')
      if (channelId) memberByChannelId.set(channelId, data)
    })
  }

  return memberByChannelId
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser

  try {
    const { id: projectId } = await params
    const projectRef = db.collection('projects').doc(projectId)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const { rooms, blocks } = resolveProjectRooms(data, projectId)

    const accessibleRooms = rooms.filter((room) => canAccessRoom(user, data, room, blocks, projectId))
    const channelIds = accessibleRooms.map((room) => {
      const roomId = String(room.id || '')
      return String(room.opsChannelId || '') || buildProjectRoomChannelId(projectId, roomId)
    })

    const memberByChannelId = await fetchMemberDocsByChannelIds(user.id, channelIds)

    const channelSnaps = await db.getAll(
      ...channelIds.map((channelId) => db.collection('channels').doc(channelId))
    )

    const summaries: RoomSummary[] = []
    const feedCandidates: FeedItem[] = []

    accessibleRooms.forEach((room, index) => {
      const roomId = String(room.id || '')
      const channelId = channelIds[index]
      const channelSnap = channelSnaps.find((item) => item.id === channelId)
      const channelData = channelSnap?.exists ? (channelSnap.data() as Record<string, unknown>) : {}
      const memberData = memberByChannelId.get(channelId)
      const isMember = Boolean(memberData)

      if (String(channelData.status || '').toLowerCase() === 'archived') return

      const unreadCount = Number(memberData?.unreadCount || 0)
      const lastReadAt = Number(memberData?.projectMissedActivityLastReadAt || 0)
      const lastMessageAt = Number(channelData.lastMessageAt || 0)
      const lastMessagePreview = String(channelData.lastMessagePreview || '').trim()
      const lastSenderName = String(channelData.lastSenderName || '').trim()
      const latestBody = lastMessagePreview
      const latestCreatedAt = lastMessageAt

      const hasMessagesToRead =
        unreadCount > 0 ||
        (lastMessageAt > 0 && (!isMember || lastMessageAt > lastReadAt))

      summaries.push({
        roomId,
        roomName: String(room.name || ''),
        roomKind: String(room.kind || '') === 'general' ? 'general' : 'block',
        blockId: String(room.blockId || ''),
        opsChannelId: channelId,
        unreadCount,
        hasMessagesToRead,
        lastMessagePreview: latestBody,
        lastMessageAt: latestCreatedAt,
        lastSenderName,
      })

      if (latestCreatedAt > 0 && (latestBody || lastSenderName)) {
        feedCandidates.push({
          roomId,
          roomName: String(room.name || ''),
          roomKind: String(room.kind || '') === 'general' ? 'general' : 'block',
          blockId: String(room.blockId || ''),
          messageId: `${roomId}-${latestCreatedAt}`,
          senderName: lastSenderName,
          bodyPreview: latestBody,
          createdAt: latestCreatedAt,
        })
      }
    })

    summaries.sort((left, right) => right.lastMessageAt - left.lastMessageAt)
    const feed = feedCandidates.sort((left, right) => right.createdAt - left.createdAt).slice(0, 8)
    const totalUnread = summaries.reduce((sum, item) => sum + item.unreadCount, 0)
    const hasMessagesToRead = summaries.some((item) => item.hasMessagesToRead)

    return NextResponse.json({
      rooms: summaries,
      feed,
      totalUnread,
      hasMessagesToRead,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
