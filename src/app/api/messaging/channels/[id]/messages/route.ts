import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import {
  buildTicketBody,
  notifyMaintenanceManagers,
} from '@/lib/maintenanceNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
}

type ChannelRecord = Record<string, unknown> & {
  source?: string
  responsibleUserId?: string
  location?: string
  status?: string
  name?: string
}

type ChannelMemberRecord = Record<string, unknown> & {
  userId?: string
  unreadCount?: number
  hidden?: boolean
  notify?: boolean
  muted?: boolean
  projectMissedActivityPending?: boolean
  projectMissedActivityWindowStartedAt?: number
  projectMissedActivityDueAt?: number
}

type MessageRecord = Record<string, unknown> & {
  createdAt?: number
  visibility?: 'channel' | 'direct'
  targetUserIds?: string[]
  senderId?: string
  body?: string
}

async function sendPushToUids(baseUrl: string, uids: string[], title: string, body: string, url: string) {
  if (!uids.length) return
  await Promise.all(
    uids.map((uid) =>
      fetch(`${baseUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, title, body, url }),
      }).catch(() => {})
    )
  )
}

async function ensureMember(channelId: string, userId: string) {
  const snap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .where('userId', '==', userId)
    .limit(1)
    .get()
  return !snap.empty
}

async function generateTicketCode(): Promise<string> {
  const counterRef = db.collection('counters').doc('maintenanceTickets')
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = (snap.data()?.value as number) || 0
    const updated = current + 1
    tx.set(counterRef, { value: updated }, { merge: true })
    return updated
  })
  return `TIC${String(next).padStart(6, '0')}`
}

async function createTicketFromMessage(args: {
  channelId: string
  messageId: string
  messageBody: string
  messageCreatedAt: number
  userId: string
  userName: string
  ticketType?: 'maquinaria' | 'deco'
}) {
  const { channelId, messageId, messageBody, messageCreatedAt, userId, userName } = args
  const ticketType = args.ticketType === 'deco' || args.ticketType === 'maquinaria'
    ? args.ticketType
    : 'maquinaria'

  const channelSnap = await db.collection('channels').doc(channelId).get()
  if (!channelSnap.exists) return null
  const channel = channelSnap.data() as ChannelRecord

  const source = channel?.source || ''
  if (source !== 'finques') return null
  if (channel?.responsibleUserId !== userId) return null

  const location = (channel?.location || '').toString().trim()
  if (!location) return null

  const description = (messageBody || '').replace(/#ticket/gi, '').trim()
  if (!description) return null

  const now = Date.now()
  const ticketCode = await generateTicketCode()
  const ticketRef = db.collection('maintenanceTickets').doc()
  const summaryBody = `${ticketCode} · ${description}`

  const membersSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .get()
  const memberDocs = membersSnap.docs
  const memberIds = memberDocs.map((d) => d.id)
  const memberUserIds = memberDocs.map((d) => (d.data() as ChannelMemberRecord)?.userId).filter(Boolean)

  const summaryRef = db.collection('messages').doc()
  const summaryData = {
    channelId,
    senderId: userId,
    senderName: userName || '',
    body: summaryBody,
    imageUrl: null,
    imagePath: null,
    imageMeta: null,
    createdAt: now,
    visibility: 'channel',
    targetUserIds: [],
    readCount: 0,
    ticketId: ticketRef.id,
    ticketCode,
    ticketStatus: 'nou',
    ticketType,
    system: true,
  }

  const batch = db.batch()
  batch.set(ticketRef, {
    ticketCode,
    incidentNumber: null,
    location,
    machine: '',
    description,
    priority: 'normal',
    status: 'nou',
    ticketType,
    createdAt: now,
    createdById: userId,
    createdByName: userName || '',
    assignedToIds: [],
    assignedToNames: [],
    assignedAt: null,
    assignedById: null,
    assignedByName: null,
    plannedStart: null,
    plannedEnd: null,
    estimatedMinutes: null,
    source: 'whatsblapp',
    sourceChannelId: channelId,
    sourceMessageId: messageId,
    sourceMessageText: description.slice(0, 200),
    sourceCreatedAt: messageCreatedAt || now,
    imageUrl: null,
    imagePath: null,
    imageMeta: null,
    needsVehicle: false,
    vehicleId: null,
    vehiclePlate: null,
    statusHistory: [
      {
        status: 'nou',
        at: now,
        byId: userId,
        byName: userName || '',
      },
    ],
  })
  batch.set(summaryRef, summaryData)
  batch.set(
    db.collection('channels').doc(channelId),
    {
      lastMessagePreview: summaryBody.slice(0, 180),
      lastMessageAt: now,
    },
    { merge: true }
  )

  for (const docId of memberIds) {
    const ref = db.collection('channelMembers').doc(docId)
    const member = memberDocs.find((d) => d.id === docId)?.data() as ChannelMemberRecord | undefined
    const memberUserId = member?.userId
    if (!memberUserId || memberUserId === userId) continue
    batch.set(ref, { unreadCount: Number(member?.unreadCount || 0) + 1 }, { merge: true })
  }

  batch.set(
    db.collection('messages').doc(messageId),
    {
      ticketId: ticketRef.id,
      ticketCode,
      ticketStatus: 'nou',
      ticketType,
    },
    { merge: true }
  )

  await batch.commit()

  await notifyMaintenanceManagers({
    payload: {
      type: 'maintenance_ticket_new',
      title: 'Nou ticket de manteniment',
      body: buildTicketBody({ machine: '', location, description }),
      ticketId: ticketRef.id,
      ticketCode,
      status: 'nou',
      priority: 'normal',
      location,
      machine: '',
      source: 'whatsblapp',
    },
    excludeIds: [userId],
  })

  return {
    ticketId: ticketRef.id,
    ticketCode,
    summaryData: { ...summaryData, id: summaryRef.id },
    memberUserIds,
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 15), 50)
  const before = searchParams.get('before')

  try {
    const isMember = role === 'admin' || role === 'direccio' ? true : await ensureMember(id, userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let query = db
      .collection('messages')
      .where('channelId', '==', id)

    if (before) {
      const beforeNum = Number(before)
      if (!Number.isNaN(beforeNum)) {
        query = query.where('createdAt', '<', beforeNum)
      }
    }

    let snap
    try {
      snap = await query.orderBy('createdAt', 'desc').limit(limit).get()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.toLowerCase().includes('requires an index')) {
        const fallback = await query.limit(50).get()
        const docs = fallback.docs
          .map((d) => ({ id: d.id, ...(d.data() as MessageRecord) }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .slice(0, limit)
        const filtered = docs.filter((m) => {
          if (m.visibility === 'direct') {
            const targets = Array.isArray(m.targetUserIds) ? m.targetUserIds : []
            return targets.includes(userId)
          }
          return true
        })
        return NextResponse.json({ messages: filtered })
      }
      throw err
    }

    let messages = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MessageRecord) }))
    messages = messages.filter((m) => {
      if (m.visibility === 'direct') {
        const targets = Array.isArray(m.targetUserIds) ? m.targetUserIds : []
        return targets.includes(userId) || m.senderId === userId
      }
      return true
    })

    return NextResponse.json({ messages })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const senderName = user.name || ''
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params

  try {
    const isMember = role === 'admin' || role === 'direccio' ? true : await ensureMember(id, userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as {
      text?: string
      visibility?: 'channel' | 'direct'
      targetUserId?: string
      imageUrl?: string
      imagePath?: string
      imageMeta?: { width?: number; height?: number; size?: number; type?: string }
      fileUrl?: string
      filePath?: string
      fileName?: string
      fileMeta?: { size?: number; type?: string }
    }
    const text = (body.text || '').toString().trim()
    const imageUrl = (body.imageUrl || '').toString().trim()
    const imagePath = (body.imagePath || '').toString().trim()
    const imageMeta = body.imageMeta || null
    const fileUrl = (body.fileUrl || '').toString().trim()
    const filePath = (body.filePath || '').toString().trim()
    const fileName = (body.fileName || '').toString().trim()
    const fileMeta = body.fileMeta || null
    const visibility = body.visibility === 'direct' ? 'direct' : 'channel'
    const targetUserId = (body.targetUserId || '').toString().trim()

    if (!text && !imageUrl && !fileUrl) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }

    if (visibility === 'direct' && !targetUserId) {
      return NextResponse.json({ error: 'Missing target user' }, { status: 400 })
    }

    const now = Date.now()
    const msgRef = db.collection('messages').doc()

    const channelSnap = await db.collection('channels').doc(id).get()
    const channelData = channelSnap.exists ? (channelSnap.data() as ChannelRecord) : null
    if (String(channelData?.status || '').toLowerCase() === 'archived') {
      return NextResponse.json({ error: 'Canal tancat' }, { status: 400 })
    }
    const channelName = channelSnap.exists ? (channelSnap.data() as ChannelRecord)?.name : ''
    const channelSource = String(channelData?.source || '').toLowerCase()
    const data = {
      channelId: id,
      senderId: userId,
      senderName,
      body: text,
      imageUrl: imageUrl || null,
      imagePath: imagePath || null,
      imageMeta: imageMeta || null,
      fileUrl: fileUrl || null,
      filePath: filePath || null,
      fileName: fileName || null,
      fileMeta: fileMeta || null,
      createdAt: now,
      visibility,
      targetUserIds: visibility === 'direct' ? [targetUserId] : [],
      readCount: 0,
    }

    // Get members to update counts
    const membersSnap = await db
      .collection('channelMembers')
      .where('channelId', '==', id)
      .get()

    const memberDocs = membersSnap.docs
    const memberIds = memberDocs.map((d) => d.id)
    const memberUserIds = memberDocs.map((d) => (d.data() as ChannelMemberRecord)?.userId).filter(Boolean)

    if (visibility === 'direct' && !memberUserIds.includes(targetUserId)) {
      return NextResponse.json({ error: 'Target user not in channel' }, { status: 400 })
    }

    const batch = db.batch()
    batch.set(msgRef, data)

    // Update channel preview
    const channelRef = db.collection('channels').doc(id)
    const preview = text ? text.slice(0, 180) : 'Imatge'
    batch.set(
      channelRef,
      {
        lastMessagePreview: preview,
        lastMessageAt: now,
      },
      { merge: true }
    )

    // Update unread counts
    for (const docId of memberIds) {
      const ref = db.collection('channelMembers').doc(docId)
      const member = memberDocs.find((d) => d.id === docId)?.data() as ChannelMemberRecord | undefined
      const memberUserId = member?.userId

      if (memberUserId === userId) continue
      if (member?.hidden || member?.notify === false) continue
      if (visibility === 'direct' && memberUserId !== targetUserId) continue
      const memberUpdate: Record<string, unknown> = {
        unreadCount: Number(member?.unreadCount || 0) + 1,
      }

      if (channelSource === 'projects' && visibility === 'channel') {
        const hasPendingWindow = Boolean(member?.projectMissedActivityPending)
        memberUpdate.projectMissedActivityPending = true
        memberUpdate.projectMissedActivityWindowStartedAt = Number(
          hasPendingWindow ? member?.projectMissedActivityWindowStartedAt || now : now
        )
        memberUpdate.projectMissedActivityDueAt = Number(
          hasPendingWindow ? member?.projectMissedActivityDueAt || now + 60 * 60 * 1000 : now + 60 * 60 * 1000
        )
        memberUpdate.projectMissedActivityLastMessageAt = now
      }

      batch.set(ref, memberUpdate, { merge: true })
    }

    await batch.commit()

    // Realtime publish
    const apiKey = process.env.ABLY_API_KEY
    if (apiKey) {
      try {
        const Ably = (await import('ably')).default
        const rest = new Ably.Rest({ key: apiKey })

        if (visibility === 'channel') {
          await rest.channels
            .get(`chat:${id}`)
            .publish('message', { ...data, id: msgRef.id })
        } else {
          await rest.channels
            .get(`user:${targetUserId}:direct`)
            .publish('message', { ...data, id: msgRef.id })
        }

        const recipients = memberDocs
          .map((d) => d.data() as ChannelMemberRecord)
          .filter((m) => !m?.hidden && m?.notify !== false)
          .map((m) => m.userId)
          .filter((uid) => uid && uid !== userId)
          .filter((uid) => (visibility === 'direct' ? uid === targetUserId : true))

        await Promise.all(
          recipients.map((uid) =>
            rest.channels
              .get(`user:${uid}:inbox`)
              .publish('updated', { channelId: id, at: now })
          )
        )
      } catch {
        // silent
      }
    }

    const recipients = memberDocs
      .map((d) => d.data() as ChannelMemberRecord)
      .filter((m) => !m?.hidden && m?.notify !== false)
      .map((m) => m.userId)
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid !== userId)
      .filter((uid) => (visibility === 'direct' ? uid === targetUserId : true))

    const mutedUsers = new Set(
      memberDocs
        .map((d) => d.data() as ChannelMemberRecord)
        .filter((m) => m?.muted || m?.notify === false || m?.hidden)
        .map((m) => m.userId)
        .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    )

    const pushRecipients = recipients.filter((uid) => !mutedUsers.has(uid))

    const baseUrl = new URL(req.url).origin
    const title = channelName ? `Missatge: ${channelName}` : 'Nou missatge'
    const pushBody = text ? text.slice(0, 180) : 'Imatge'
    const url = `/menu/missatgeria?channel=${id}`
    const shouldSendPush =
      channelSource !== 'projects' || visibility === 'direct'

    if (shouldSendPush) {
      await sendPushToUids(baseUrl, pushRecipients, title, pushBody, url)
    }

    const shouldAutoTicket =
      visibility === 'channel' && text.toLowerCase().includes('#ticket')

    if (shouldAutoTicket) {
      const ticketResult = await createTicketFromMessage({
        channelId: id,
        messageId: msgRef.id,
        messageBody: text,
        messageCreatedAt: now,
        userId,
        userName: senderName,
        ticketType: 'maquinaria',
      })

      if (ticketResult && apiKey) {
        try {
          const Ably = (await import('ably')).default
          const rest = new Ably.Rest({ key: apiKey })
          await rest.channels
            .get(`chat:${id}`)
            .publish('message', ticketResult.summaryData)

          await Promise.all(
            ticketResult.memberUserIds
              .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid !== userId)
              .map((uid) =>
                rest.channels.get(`user:${uid}:inbox`).publish('updated', {
                  channelId: id,
                  at: Date.now(),
                })
              )
          )
        } catch {
          // silent
        }
      }

      if (ticketResult) {
        const mutedUsersForTicket = new Set(
          memberDocs
            .map((d) => d.data() as ChannelMemberRecord)
            .filter((m) => m?.muted)
            .map((m) => m.userId)
        )
        const pushRecipientsTicket = ticketResult.memberUserIds.filter(
          (uid): uid is string =>
            typeof uid === 'string' && uid.length > 0 && uid !== userId && !mutedUsersForTicket.has(uid)
        )
        await sendPushToUids(baseUrl, pushRecipientsTicket, title, ticketResult.summaryData.body, url)
      }
    }

    return NextResponse.json({ success: true, messageId: msgRef.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
