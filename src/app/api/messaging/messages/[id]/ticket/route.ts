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

type MessageRecord = Record<string, unknown> & {
  ticketId?: string
  ticketCode?: string
  channelId?: string
  body?: string
  createdAt?: number
}

type ChannelRecord = Record<string, unknown> & {
  source?: string
  responsibleUserId?: string
  location?: string
  name?: string
}

type ChannelMemberRecord = Record<string, unknown> & {
  userId?: string
  unreadCount?: number
  hidden?: boolean
  notify?: boolean
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { ticketType?: string }
  const ticketType = body?.ticketType === 'deco' || body?.ticketType === 'maquinaria'
    ? body.ticketType
    : 'maquinaria'

  try {
    const msgRef = db.collection('messages').doc(id)
    const msgSnap = await msgRef.get()
    if (!msgSnap.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const msg = msgSnap.data() as MessageRecord
    if (msg?.ticketId) {
      return NextResponse.json(
        { ticketId: msg.ticketId, ticketCode: msg.ticketCode || null },
        { status: 200 }
      )
    }

    const channelId = msg?.channelId
    if (!channelId) {
      return NextResponse.json({ error: 'Missing channel' }, { status: 400 })
    }

    const channelSnap = await db.collection('channels').doc(channelId).get()
    if (!channelSnap.exists) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    const channel = channelSnap.data() as ChannelRecord
    const source = channel?.source || ''
    if (source !== 'finques') {
      return NextResponse.json({ error: 'Channel not allowed' }, { status: 400 })
    }

    if (channel?.responsibleUserId !== user.id) {
      return NextResponse.json({ error: 'Only responsible can create tickets' }, { status: 403 })
    }

    const location = (channel?.location || '').toString().trim()
    if (!location) {
      return NextResponse.json({ error: 'Missing location' }, { status: 400 })
    }

    const description = (msg?.body || '').toString().trim()
    if (!description) {
      return NextResponse.json({ error: 'Missing observations' }, { status: 400 })
    }

    const now = Date.now()
    const ticketCode = await generateTicketCode()
    const ticketRef = db.collection('maintenanceTickets').doc()

    const ticketData = {
      ticketCode,
      incidentNumber: null,
      location,
      machine: '',
      description,
      priority: 'normal',
      status: 'nou',
      ticketType,
      createdAt: now,
      createdById: user.id,
      createdByName: user.name || '',
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
      sourceMessageId: id,
      sourceMessageText: description.slice(0, 200),
      sourceCreatedAt: msg?.createdAt || now,
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
          byId: user.id,
          byName: user.name || '',
        },
      ],
    }

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
      senderId: user.id,
      senderName: user.name || '',
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
    }

    const batch = db.batch()
    batch.set(ticketRef, ticketData)
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
      if (!memberUserId || memberUserId === user.id) continue
      if (member?.hidden || member?.notify === false) continue
      batch.set(ref, { unreadCount: Number(member?.unreadCount || 0) + 1 }, { merge: true })
    }

    batch.set(
      msgRef,
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
      excludeIds: [user.id],
    })

    const apiKey = process.env.ABLY_API_KEY
    if (apiKey) {
      try {
        const Ably = (await import('ably')).default
        const rest = new Ably.Rest({ key: apiKey })

        await rest.channels
          .get(`chat:${channelId}`)
          .publish('message', { ...summaryData, id: summaryRef.id })

        await Promise.all(
          memberUserIds
            .filter((uid) => uid && uid !== user.id)
            .filter((uid) => {
              const m = memberDocs.find((d) => (d.data() as ChannelMemberRecord)?.userId === uid)?.data() as ChannelMemberRecord | undefined
              return !m?.hidden && m?.notify !== false
            })
            .map((uid) =>
              rest.channels.get(`user:${uid}:inbox`).publish('updated', {
                channelId,
                at: now,
              })
            )
        )
      } catch {
        // silent
      }
    }

    const mutedUsers = new Set(
      memberDocs
        .map((d) => d.data() as ChannelMemberRecord)
        .filter((m) => m?.muted || m?.notify === false || m?.hidden)
        .map((m) => m.userId)
    )

    const pushRecipients = memberUserIds.filter(
      (uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid !== user.id && !mutedUsers.has(uid)
    )

    const baseUrl = new URL(req.url).origin
    const title = channel?.name ? `Missatge: ${channel.name}` : 'Nou missatge'
    const url = `/menu/missatgeria?channel=${channelId}`
    await sendPushToUids(baseUrl, pushRecipients, title, summaryBody, url)

    return NextResponse.json(
      { success: true, ticketId: ticketRef.id, ticketCode },
      { status: 201 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
