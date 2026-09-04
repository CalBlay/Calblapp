import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  canManageMaintenanceTickets,
  isMaintenanceCapDepartment,
  normalizeDept,
  type AccessUser,
} from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import {
  canManageAllMaintenanceTickets,
  canManageMaintenanceTicketInbox,
  canUseDecoTicketPermission,
} from '@/lib/server/maintenanceTicketsAccess'
import {
  listDecoTicketInboxRecipientIds,
  listMaintenanceTicketInboxRecipientIds,
} from '@/lib/server/maintenanceTicketInboxRecipients'
import { buildMaintenanceTicketChannelId } from '@/lib/messaging/maintenanceTicketChatIds'
import { isDecoDepartmentHead } from '@/lib/decoTicketsPermissions'
import { isTicketOpsActive } from '@/lib/messaging/ticketOpsStatus'

export type MaintenanceTicketOpsRecord = {
  id: string
  ticketCode?: string | null
  location?: string | null
  machine?: string | null
  description?: string | null
  createdById?: string | null
  createdByName?: string | null
  opsChannelId?: string | null
  opsManagerUserId?: string | null
  status?: string | null
  workflowStage?: string | null
  externalized?: boolean | null
  ticketType?: 'maquinaria' | 'deco' | null
}

export type MaintenanceTicketOpsRoom = {
  roomId: string
  ticketId: string
  /** Codi i descripció del ticket (sidebar i capçalera). */
  label: string
  ticketLabel: string
  creatorId?: string | null
  creatorName?: string | null
  channelId: string
  channelReady?: boolean
  unreadCount: number
  canManageMembers: boolean
}

type ChatMember = { userId: string; userName: string }

function isDecoTicket(ticket: MaintenanceTicketOpsRecord) {
  return String(ticket.ticketType || 'maquinaria').trim().toLowerCase() === 'deco'
}

async function canManageTicketOpsScope(
  ticket: MaintenanceTicketOpsRecord,
  user: AccessUser & { id: string }
) {
  if (isDecoTicket(ticket)) {
    return (
      (await canUseDecoTicketPermission(user, 'manage')) ||
      (await canUseDecoTicketPermission(user, 'inbox'))
    )
  }
  return (
    canManageMaintenanceTickets(user) ||
    (await canManageAllMaintenanceTickets(user)) ||
    (await canManageMaintenanceTicketInbox(user))
  )
}

async function listMaintenanceTicketOpsManagerIds() {
  const [inboxIds, usersSnap] = await Promise.all([
    listMaintenanceTicketInboxRecipientIds(),
    db.collection('users').get(),
  ])
  const managerIds = await Promise.all(
    usersSnap.docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>
      const user: AccessUser & { id: string } = {
        id: doc.id,
        role: String(data.role || ''),
        department: String(data.department || data.departmentLower || ''),
      }
      const role = normalizeRole(user.role)
      const isMaintenanceHead =
        role === 'cap' && isMaintenanceCapDepartment(user.department)
      if (isMaintenanceHead) return doc.id
      if (role === 'admin' || role === 'direccio') return ''
      return (await canManageAllMaintenanceTickets(user)) ? doc.id : ''
    })
  )

  return [...new Set([...inboxIds, ...managerIds.filter(Boolean)])]
}

async function listTicketOpsRecipientIds(ticket: MaintenanceTicketOpsRecord) {
  return isDecoTicket(ticket)
    ? listDecoTicketInboxRecipientIds()
    : listMaintenanceTicketOpsManagerIds()
}

async function fetchUserDisplayNames(uids: string[]) {
  const map = new Map<string, string>()
  const unique = [...new Set(uids.filter(Boolean))]
  const chunkSize = 10
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const snaps = await db.getAll(...chunk.map((uid) => db.collection('users').doc(uid)))
    snaps.forEach((doc) => {
      if (!doc.exists) return
      const data = doc.data() as { name?: string; email?: string }
      const name = String(data?.name || data?.email || doc.id).trim()
      if (name) map.set(doc.id, name)
    })
  }
  return map
}

async function getUnreadCount(channelId: string, userId: string) {
  const snap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .where('userId', '==', userId)
    .limit(1)
    .get()
  if (snap.empty) return 0
  const unread = Number((snap.docs[0].data() as { unreadCount?: number })?.unreadCount || 0)
  return Number.isFinite(unread) ? unread : 0
}

export async function canAccessMaintenanceTicketOps(params: {
  ticket: MaintenanceTicketOpsRecord
  user: AccessUser & { id: string }
}): Promise<boolean> {
  const role = normalizeRole(params.user.role)
  if (role === 'admin' || role === 'direccio') return true
  if (await canManageTicketOpsScope(params.ticket, params.user)) return true
  if (String(params.ticket.createdById || '').trim() === params.user.id) return true
  return false
}

export async function canManageMaintenanceTicketChatMembers(params: {
  ticket: MaintenanceTicketOpsRecord
  channel: { responsibleUserId?: string | null }
  userId: string
  role: string
  user?: AccessUser & { id: string }
}) {
  const role = normalizeRole(params.role)
  if (role === 'admin' || role === 'direccio') return true

  if (params.user && (await canManageTicketOpsScope(params.ticket, params.user))) return true

  const managerId = String(
    params.channel.responsibleUserId || params.ticket.opsManagerUserId || ''
  ).trim()
  if (managerId && managerId === params.userId) return true

  const gestorIds = await listTicketOpsRecipientIds(params.ticket)
  if (gestorIds.includes(params.userId)) return true

  return false
}

async function resolveManagerUserId(params: {
  ticket: MaintenanceTicketOpsRecord
  actor: AccessUser & { id: string }
}) {
  const stored = String(params.ticket.opsManagerUserId || '').trim()
  if (stored) return stored

  if (isDecoTicket(params.ticket)) {
    const recipientIds = await listDecoTicketInboxRecipientIds()
    if (recipientIds.length > 0) {
      const userSnaps = await db.getAll(
        ...recipientIds.map((userId) => db.collection('users').doc(userId))
      )
      const departmentHead = userSnaps.find((snap) => {
        if (!snap.exists) return false
        const data = snap.data() as Record<string, unknown>
        return isDecoDepartmentHead({
          role: String(data.role || ''),
          department: String(data.department || data.departmentLower || ''),
        })
      })
      if (departmentHead) return departmentHead.id
    }
  } else {
    const recipientIds = await listMaintenanceTicketOpsManagerIds()
    if (recipientIds.length > 0) {
      const userSnaps = await db.getAll(
        ...recipientIds.map((userId) => db.collection('users').doc(userId))
      )
      const departmentHeads = userSnaps.filter((snap) => {
        if (!snap.exists) return false
        const data = snap.data() as Record<string, unknown>
        return (
          normalizeRole(String(data.role || '')) === 'cap' &&
          isMaintenanceCapDepartment(
            String(data.department || data.departmentLower || '')
          )
        )
      })
      const departmentHead =
        departmentHeads.find((snap) => {
          const data = snap.data() as Record<string, unknown>
          return normalizeDept(String(data.department || data.departmentLower || '')) === 'manteniment'
        }) || departmentHeads[0]
      if (departmentHead) return departmentHead.id
    }
  }

  if (await canManageTicketOpsScope(params.ticket, params.actor)) return params.actor.id
  return ''
}

async function collectDefaultMemberIds(params: {
  ticket: MaintenanceTicketOpsRecord
  managerUserId?: string
}) {
  const memberIds = new Set<string>()
  const creatorId = String(params.ticket.createdById || '').trim()
  if (creatorId) memberIds.add(creatorId)

  const gestorIds = await listTicketOpsRecipientIds(params.ticket)
  for (const gestorId of gestorIds) {
    if (gestorId) memberIds.add(gestorId)
  }

  const managerId = String(params.managerUserId || '').trim()
  if (managerId) memberIds.add(managerId)

  return [...memberIds]
}

function ticketChannelLabel(ticket: MaintenanceTicketOpsRecord) {
  const code = String(ticket.ticketCode || '').trim()
  const base = String(ticket.machine || ticket.description || ticket.location || 'Ticket').trim()
  return code ? `${code} · ${base}` : base
}

function creatorSidebarLabel(ticket: MaintenanceTicketOpsRecord) {
  return String(ticket.createdByName || ticket.location || 'Creador').trim() || 'Creador'
}

/** El xat continua actiu durant la planificació i execució, fins al tancament. */
export function isOpsActiveMaintenanceTicket(ticket: MaintenanceTicketOpsRecord): boolean {
  return isTicketOpsActive(ticket)
}

async function buildMaintenanceTicketOpsRoom(params: {
  ticket: MaintenanceTicketOpsRecord
  user: AccessUser & { id: string }
}): Promise<MaintenanceTicketOpsRoom> {
  const ticketId = String(params.ticket.id || '').trim()
  const storedChannelId = String(params.ticket.opsChannelId || '').trim()
  const channelId = storedChannelId || buildMaintenanceTicketChannelId(ticketId)

  const canManageMembers = await canManageMaintenanceTicketChatMembers({
    ticket: params.ticket,
    channel: { responsibleUserId: params.ticket.opsManagerUserId },
    userId: params.user.id,
    role: String(params.user.role || ''),
    user: params.user,
  })

  return {
    roomId: ticketId,
    ticketId,
    label: ticketChannelLabel(params.ticket),
    ticketLabel: ticketChannelLabel(params.ticket),
    creatorId: String(params.ticket.createdById || '').trim() || null,
    creatorName: creatorSidebarLabel(params.ticket),
    channelId,
    channelReady: Boolean(storedChannelId),
    unreadCount: storedChannelId
      ? await getUnreadCount(channelId, params.user.id)
      : 0,
    canManageMembers,
  }
}

export async function syncMaintenanceTicketOpsChannel(params: {
  ticket: MaintenanceTicketOpsRecord
  managerUserId?: string
  extraMemberIds?: string[]
}) {
  const ticketId = String(params.ticket.id || '').trim()
  if (!ticketId) throw new Error('Ticket no vàlid.')

  const now = Date.now()
  const channelId =
    String(params.ticket.opsChannelId || '').trim() || buildMaintenanceTicketChannelId(ticketId)
  const managerUserId = String(params.managerUserId || params.ticket.opsManagerUserId || '').trim()

  const defaultMemberIds = await collectDefaultMemberIds({
    ticket: params.ticket,
    managerUserId,
  })
  const extraMemberIds = (params.extraMemberIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
  const allMemberIds = [...new Set([...defaultMemberIds, ...extraMemberIds])]
  const nameMap = await fetchUserDisplayNames(allMemberIds)
  const finalMembers: ChatMember[] = allMemberIds.map((userId) => ({
    userId,
    userName: nameMap.get(userId) || userId,
  }))

  const channelRef = db.collection('channels').doc(channelId)
  const channelSnap = await channelRef.get()
  const existingChannel = channelSnap.exists
    ? (channelSnap.data() as Record<string, unknown>)
    : null
  const existingExtras = Array.isArray(existingChannel?.chatExtraMemberIds)
    ? existingChannel.chatExtraMemberIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  const mergedExtras = [...new Set([...existingExtras, ...extraMemberIds])].filter(
    (id) => !defaultMemberIds.includes(id)
  )

  const managerName = managerUserId ? nameMap.get(managerUserId) || null : null
  const channelPayload = {
    name: `Ticket · ${ticketChannelLabel(params.ticket)}`,
    type: 'group',
    source: 'maintenance_ticket',
    location: String(params.ticket.location || '').trim() || null,
    ticketId,
    ticketCode: String(params.ticket.ticketCode || '').trim() || null,
    ticketType: isDecoTicket(params.ticket) ? 'deco' : 'maquinaria',
    responsibleUserId: managerUserId || null,
    responsibleUserName: managerName,
    requesterUserId: String(params.ticket.createdById || '').trim() || null,
    requesterUserName: String(params.ticket.createdByName || '').trim() || null,
    chatExtraMemberIds: mergedExtras,
    status: 'active',
    updatedAt: now,
    ...(channelSnap.exists
      ? {}
      : {
          lastMessagePreview: '',
          lastMessageAt: 0,
          createdAt: now,
          createdBy: 'system',
        }),
  }

  await channelRef.set(channelPayload, { merge: true })

  const existingMembersSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .get()

  const existingByUserId = new Map(
    existingMembersSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return [String(data.userId || ''), doc]
    })
  )
  const nextMemberIds = new Set(finalMembers.map((member) => member.userId))
  const batch = db.batch()

  for (const member of finalMembers) {
    const ref = db.collection('channelMembers').doc(`${channelId}_${member.userId}`)
    const existing = existingByUserId.get(member.userId)
    const currentData = existing?.data() as Record<string, unknown> | undefined
    batch.set(
      ref,
      {
        channelId,
        userId: member.userId,
        userName: member.userName,
        role: 'member',
        joinedAt: Number(currentData?.joinedAt || now),
        unreadCount: Number(currentData?.unreadCount || 0),
        muted: Boolean(currentData?.muted),
        hidden: Boolean(currentData?.hidden),
        notify: currentData?.notify !== false,
      },
      { merge: true }
    )
  }

  for (const doc of existingMembersSnap.docs) {
    const data = doc.data() as Record<string, unknown>
    const userId = String(data.userId || '')
    if (!userId || nextMemberIds.has(userId)) continue
    batch.delete(doc.ref)
  }

  await batch.commit()

  const ticketUpdates: Record<string, unknown> = {
    opsChannelId: channelId,
    updatedAt: now,
  }
  if (managerUserId) ticketUpdates.opsManagerUserId = managerUserId

  await db.collection('maintenanceTickets').doc(ticketId).set(ticketUpdates, { merge: true })

  return {
    channelId,
    managerUserId: managerUserId || null,
    memberCount: finalMembers.length,
  }
}

export async function ensureMaintenanceTicketOpsChannel(params: {
  ticket: MaintenanceTicketOpsRecord
  actor: AccessUser & { id: string }
}) {
  const canAccess = await canAccessMaintenanceTicketOps({
    ticket: params.ticket,
    user: params.actor,
  })
  if (!canAccess) throw new Error('Sense permís per obrir el xat del ticket.')

  const managerUserId = await resolveManagerUserId({
    ticket: params.ticket,
    actor: params.actor,
  })

  return syncMaintenanceTicketOpsChannel({
    ticket: params.ticket,
    managerUserId,
  })
}

export async function listMaintenanceTicketOpsRooms(params: {
  ticket: MaintenanceTicketOpsRecord
  user: AccessUser & { id: string }
}): Promise<MaintenanceTicketOpsRoom[]> {
  const canAccess = await canAccessMaintenanceTicketOps({
    ticket: params.ticket,
    user: params.user,
  })
  if (!canAccess) return []
  if (!isOpsActiveMaintenanceTicket(params.ticket)) return []

  return [await buildMaintenanceTicketOpsRoom({ ticket: params.ticket, user: params.user })]
}

export async function listAllMaintenanceTicketOpsRooms(params: {
  user: AccessUser & { id: string }
  ticketType?: 'maquinaria' | 'deco'
}): Promise<MaintenanceTicketOpsRoom[]> {
  const requestedType = params.ticketType === 'deco' ? 'deco' : 'maquinaria'
  const scopeTicket: MaintenanceTicketOpsRecord = { id: '', ticketType: requestedType }
  const canViewAll = await canManageTicketOpsScope(scopeTicket, params.user)

  let snap: FirebaseFirestore.QuerySnapshot
  if (canViewAll) {
    snap = await db.collection('maintenanceTickets').orderBy('updatedAt', 'desc').limit(300).get()
  } else {
    snap = await db
      .collection('maintenanceTickets')
      .where('createdById', '==', params.user.id)
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get()
  }

  const rooms: MaintenanceTicketOpsRoom[] = []

  for (const doc of snap.docs) {
    const ticket = { ...(doc.data() as MaintenanceTicketOpsRecord), id: doc.id }
    if (isDecoTicket(ticket) !== (requestedType === 'deco')) continue
    if (!isOpsActiveMaintenanceTicket(ticket)) continue

    const canAccess = await canAccessMaintenanceTicketOps({ ticket, user: params.user })
    if (!canAccess) continue

    rooms.push(await buildMaintenanceTicketOpsRoom({ ticket, user: params.user }))
  }

  rooms.sort((a, b) => {
    const unreadDiff = Number(b.unreadCount || 0) - Number(a.unreadCount || 0)
    if (unreadDiff !== 0) return unreadDiff
    return a.ticketLabel.localeCompare(b.ticketLabel, 'ca')
  })

  return rooms
}

export async function addMaintenanceTicketChatExtraMember(params: {
  ticketId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const ticketId = String(params.ticketId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!ticketId || !targetUserId) throw new Error('Dades no vàlides.')

  const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get()
  if (!ticketSnap.exists) throw new Error('Ticket no trobat.')
  const ticket = { ...(ticketSnap.data() as MaintenanceTicketOpsRecord), id: ticketSnap.id }

  const channelId =
    String(ticket.opsChannelId || '').trim() || buildMaintenanceTicketChannelId(ticketId)
  const channelSnap = await db.collection('channels').doc(channelId).get()
  const channel = channelSnap.exists ? (channelSnap.data() as Record<string, unknown>) : {}

  const canManage = await canManageMaintenanceTicketChatMembers({
    ticket,
    channel: { responsibleUserId: String(channel.responsibleUserId || ticket.opsManagerUserId || '') },
    userId: params.actorUserId,
    role: params.actorRole,
  })
  if (!canManage) throw new Error('Sense permís per afegir participants.')

  const extraIds = new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  extraIds.add(targetUserId)

  return syncMaintenanceTicketOpsChannel({
    ticket,
    managerUserId: String(ticket.opsManagerUserId || channel.responsibleUserId || '').trim(),
    extraMemberIds: [...extraIds],
  })
}

export async function removeMaintenanceTicketChatExtraMember(params: {
  ticketId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const ticketId = String(params.ticketId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!ticketId || !targetUserId) throw new Error('Dades no vàlides.')

  const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get()
  if (!ticketSnap.exists) throw new Error('Ticket no trobat.')
  const ticket = { ...(ticketSnap.data() as MaintenanceTicketOpsRecord), id: ticketSnap.id }

  const channelId =
    String(ticket.opsChannelId || '').trim() || buildMaintenanceTicketChannelId(ticketId)
  const channelSnap = await db.collection('channels').doc(channelId).get()
  if (!channelSnap.exists) throw new Error('Canal no trobat.')
  const channel = channelSnap.data() as Record<string, unknown>

  const extraIds = new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  if (!extraIds.has(targetUserId)) {
    throw new Error('Només es poden treure participants afegits manualment.')
  }

  const canManage = await canManageMaintenanceTicketChatMembers({
    ticket,
    channel: { responsibleUserId: String(channel.responsibleUserId || ticket.opsManagerUserId || '') },
    userId: params.actorUserId,
    role: params.actorRole,
  })
  if (!canManage) throw new Error('Sense permís per treure participants.')

  extraIds.delete(targetUserId)

  return syncMaintenanceTicketOpsChannel({
    ticket,
    managerUserId: String(ticket.opsManagerUserId || channel.responsibleUserId || '').trim(),
    extraMemberIds: [...extraIds],
  })
}

export function collectMaintenanceTicketExtraMemberIds(channel: Record<string, unknown>) {
  return new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
}
