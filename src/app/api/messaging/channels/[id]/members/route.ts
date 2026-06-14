import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { getEventComandaOrder } from '@/lib/eventComanda/order.server'
import { canManageEventComandaChatMembers } from '@/lib/messaging/comandaChat.server'
import {
  canManageEventProductionChatMembers,
  addEventProductionChatExtraMember,
  removeEventProductionChatExtraMember,
} from '@/lib/messaging/eventChat'
import {
  canManageOpsLocationChannelMembers,
  addOpsLocationChannelExtraMember,
  removeOpsLocationChannelExtraMember,
  collectOpsLocationExtraMemberIds,
  isOpsLocationChannelSource,
} from '@/lib/messaging/opsChannelMembers.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'

export const runtime = 'nodejs'

type SessionUser = { id: string; role?: string }
type ChannelRecord = Record<string, unknown> & {
  source?: string
  eventId?: string
  warehouseId?: string
  requesterUserId?: string | null
  requesterUserName?: string | null
  responsibleUserId?: string | null
  responsibleUserName?: string | null
  chatExtraMemberIds?: string[]
}
type ChannelMemberRecord = Record<string, unknown> & {
  userId?: string
  userName?: string
  hidden?: boolean
  muted?: boolean
}
type UserRecord = Record<string, unknown> & {
  role?: string
  rol?: string
  nivell?: string
  nivel?: string
  level?: string
  department?: string
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params

  try {
    const channelSnap = await db.collection('channels').doc(id).get()
    const channel = channelSnap.exists ? (channelSnap.data() as ChannelRecord) : {}
    const channelSource = String(channel?.source || '')
    const isEventChannel = channelSource === 'events' || channelSource === 'event_comanda'

    if (role !== 'admin' && role !== 'direccio') {
      const memberCheck = await db
        .collection('channelMembers')
        .where('channelId', '==', id)
        .where('userId', '==', userId)
        .limit(1)
        .get()

      if (memberCheck.empty) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const membersSnap = await db
      .collection('channelMembers')
      .where('channelId', '==', id)
      .get()

    const baseMembers = membersSnap.docs
      .map((d) => {
        const data = d.data() as ChannelMemberRecord
        return {
          userId: data.userId,
          userName: data.userName || '',
          hidden: Boolean(data.hidden),
        }
      })

    const resolveRole = (data: UserRecord) =>
      normalizeRole(
        data?.role ||
          data?.rol ||
          data?.nivell ||
          data?.nivel ||
          data?.level ||
          ''
      )

    const hiddenByRole = new Set<string>()
    if (isEventChannel) {
      const ids = baseMembers
        .map((m) => m.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
      if (ids.length > 0) {
        const refs = ids.map((uid) => db.collection('users').doc(uid))
        const snaps = await db.getAll(...refs)
        snaps.forEach((doc) => {
          if (!doc.exists) return
          const data = doc.data() as UserRecord
          const r = resolveRole(data)
          if (r === 'admin' || r === 'direccio') {
            hiddenByRole.add(doc.id)
          }
        })
      }
    }

    const members = baseMembers.filter((m) => {
      if (m.userId === userId) return true
      if (m.hidden) return false
      if (isEventChannel && m.userId && hiddenByRole.has(m.userId)) return false
      return true
    })

    const memberIds = members
      .map((member) => member.userId)
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)

    const userById = new Map<string, UserRecord>()
    if (memberIds.length > 0) {
      const refs = memberIds.map((uid) => db.collection('users').doc(uid))
      const snaps = await db.getAll(...refs)
      snaps.forEach((doc) => {
        if (!doc.exists) return
        userById.set(doc.id, doc.data() as UserRecord)
      })
    }

    let extraMemberIds = new Set<string>()
    let canManageComandaMembers = false
    let canManageProductionMembers = false
    let canManageOpsLocationMembers = false
    let requesterUserId = String(channel.requesterUserId || channel.responsibleUserId || '').trim()
    const responsibleUserId = String(channel.responsibleUserId || requesterUserId || '').trim()

    const viewerMember = baseMembers.find((member) => member.userId === userId)
    const viewerMemberDoc = membersSnap.docs.find(
      (doc) => String((doc.data() as ChannelMemberRecord)?.userId || '') === userId
    )
    const viewerMemberData = viewerMemberDoc?.data() as ChannelMemberRecord | undefined

    const canEditResponsible =
      role === 'admin' ||
      role === 'direccio' ||
      (responsibleUserId.length > 0 && responsibleUserId === userId) ||
      (channelSource === 'event_comanda' &&
        requesterUserId.length > 0 &&
        requesterUserId === userId)

    if (isOpsLocationChannelSource(channelSource)) {
      extraMemberIds = collectOpsLocationExtraMemberIds(channel)
      canManageOpsLocationMembers = await canManageOpsLocationChannelMembers({
        channel: { responsibleUserId: channel.responsibleUserId },
        userId,
        role,
      })
    }

    if (channelSource === 'events') {
      const productionExtraIds = Array.isArray(channel.chatExtraMemberIds)
        ? channel.chatExtraMemberIds
        : []
      for (const extraId of productionExtraIds) {
        const normalized = String(extraId || '').trim()
        if (normalized) extraMemberIds.add(normalized)
      }
      canManageProductionMembers = await canManageEventProductionChatMembers({
        channel: {
          responsibleUserId: String(channel.responsibleUserId || ''),
          eventId: String(channel.eventId || ''),
        },
        userId,
        role,
      })
    }

    if (channelSource === 'event_comanda' && channel.eventId && channel.warehouseId) {
      requesterUserId = String(channel.requesterUserId || requesterUserId).trim()
      const storedExtras = Array.isArray(channel.chatExtraMemberIds)
        ? channel.chatExtraMemberIds
        : null

      if (storedExtras) {
        for (const extraId of storedExtras) {
          const normalized = String(extraId || '').trim()
          if (normalized) extraMemberIds.add(normalized)
        }
        canManageComandaMembers = await canManageEventComandaChatMembers({
          requesterUserId,
          userId,
          role,
          channelId: id,
        })
      } else {
        const order = await getEventComandaOrder(String(channel.eventId))
        if (order?.sentAt) {
          requesterUserId = String(order.sentByUserId || requesterUserId).trim()
          const warehouseKey = warehouseDocId(String(channel.warehouseId))
          const channelBatchId = String(channel.batchId || '').trim()
          for (const batch of order.batches || []) {
            if (warehouseDocId(batch.warehouseId) !== warehouseKey) continue
            if (channelBatchId) {
              const batchKey = String(batch.batchId || batch.warehouseId).trim()
              if (batchKey !== channelBatchId) continue
            }
            for (const extraId of batch.chatExtraMemberIds || []) {
              const normalized = String(extraId || '').trim()
              if (normalized) extraMemberIds.add(normalized)
            }
          }
          canManageComandaMembers = await canManageEventComandaChatMembers({
            order,
            requesterUserId,
            userId,
            role,
            channelId: id,
          })
        }
      }
    }

    const enrichedMembers = members.map((member) => {
      const uid = String(member.userId || '')
      const userData = uid ? userById.get(uid) : undefined
      const department = String(userData?.department || '').trim()
      const memberRole = userData ? resolveRole(userData) : ''
      const isResponsible =
        channelSource === 'event_comanda'
          ? Boolean(requesterUserId && uid === requesterUserId)
          : Boolean(
              channel.responsibleUserId &&
                uid === String(channel.responsibleUserId)
            )

      return {
        ...member,
        department: department || undefined,
        role: memberRole || undefined,
        isResponsible,
        canRemove:
          (channelSource === 'event_comanda' &&
            canManageComandaMembers &&
            extraMemberIds.has(uid)) ||
          (channelSource === 'events' &&
            canManageProductionMembers &&
            extraMemberIds.has(uid)) ||
          (isOpsLocationChannelSource(channelSource) &&
            canManageOpsLocationMembers &&
            extraMemberIds.has(uid)),
      }
    })

    return NextResponse.json({
      members: enrichedMembers,
      responsibleUserId: channel.responsibleUserId || requesterUserId || null,
      responsibleUserName:
        channel.responsibleUserName ||
        channel.requesterUserName ||
        null,
      canManageMembers:
        channelSource === 'event_comanda'
          ? canManageComandaMembers
          : channelSource === 'events'
            ? canManageProductionMembers
            : isOpsLocationChannelSource(channelSource)
              ? canManageOpsLocationMembers
              : false,
      canEditResponsible,
      viewer: {
        userId,
        muted: Boolean(viewerMemberData?.muted),
        hidden: Boolean(viewerMember?.hidden || viewerMemberData?.hidden),
      },
    })
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
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { userId?: string }
  const targetUserId = String(body.userId || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'Cal seleccionar un usuari.' }, { status: 400 })
  }

  try {
    const channelSnap = await db.collection('channels').doc(id).get()
    if (!channelSnap.exists) {
      return NextResponse.json({ error: 'Canal no trobat.' }, { status: 404 })
    }
    const channel = channelSnap.data() as ChannelRecord
    const source = String(channel.source || '')

    if (source === 'events') {
      const result = await addEventProductionChatExtraMember({
        channelId: id,
        targetUserId,
        actorUserId: user.id,
        actorRole: role,
      })

      return NextResponse.json({ ok: true, channelId: result?.channelId || id })
    }

    if (isOpsLocationChannelSource(source)) {
      const result = await addOpsLocationChannelExtraMember({
        channelId: id,
        targetUserId,
        actorUserId: user.id,
        actorRole: role,
      })
      return NextResponse.json({ ok: true, channelId: result.channelId })
    }

    return NextResponse.json({ error: 'Tipus de canal no compatible.' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No s\'ha pogut afegir el participant.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params
  const url = new URL(req.url)
  const targetUserId = String(url.searchParams.get('userId') || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'Cal seleccionar un usuari.' }, { status: 400 })
  }

  try {
    const channelSnap = await db.collection('channels').doc(id).get()
    if (!channelSnap.exists) {
      return NextResponse.json({ error: 'Canal no trobat.' }, { status: 404 })
    }
    const channel = channelSnap.data() as ChannelRecord
    const source = String(channel.source || '')

    if (source === 'events') {
      const result = await removeEventProductionChatExtraMember({
        channelId: id,
        targetUserId,
        actorUserId: user.id,
        actorRole: role,
      })
      return NextResponse.json({ ok: true, channelId: result?.channelId || id })
    }

    if (isOpsLocationChannelSource(source)) {
      const result = await removeOpsLocationChannelExtraMember({
        channelId: id,
        targetUserId,
        actorUserId: user.id,
        actorRole: role,
      })
      return NextResponse.json({ ok: true, channelId: result.channelId })
    }

    return NextResponse.json({ error: 'Tipus de canal no compatible.' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No s\'ha pogut treure el participant.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
