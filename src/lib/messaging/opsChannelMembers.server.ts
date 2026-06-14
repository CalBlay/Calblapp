import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

const OPS_LOCATION_SOURCES = new Set(['finques', 'restaurants'])

type ChannelRecord = Record<string, unknown> & {
  source?: string
  responsibleUserId?: string | null
  chatExtraMemberIds?: string[]
}

export function isOpsLocationChannelSource(source: string) {
  return OPS_LOCATION_SOURCES.has(String(source || '').trim())
}

export async function canManageOpsLocationChannelMembers(params: {
  channel: { responsibleUserId?: string | null }
  userId: string
  role: string
}) {
  const role = normalizeRole(params.role)
  if (role === 'admin' || role === 'direccio') return true

  const responsibleId = String(params.channel.responsibleUserId || '').trim()
  return Boolean(responsibleId && responsibleId === params.userId)
}

async function resolveUserName(userId: string) {
  const snap = await db.collection('users').doc(userId).get()
  if (!snap.exists) return ''
  const data = snap.data() as Record<string, unknown>
  return String(data.name || '').trim()
}

async function ensureChannelMember(channelId: string, userId: string, userName: string) {
  const now = Date.now()
  const ref = db.collection('channelMembers').doc(`${channelId}_${userId}`)
  const existing = await ref.get()
  const current = existing.data() as Record<string, unknown> | undefined

  await ref.set(
    {
      channelId,
      userId,
      userName,
      role: 'member',
      joinedAt: Number(current?.joinedAt || now),
      unreadCount: Number(current?.unreadCount || 0),
      muted: Boolean(current?.muted),
      hidden: Boolean(current?.hidden),
      notify: current?.notify !== false,
    },
    { merge: true }
  )
}

export async function addOpsLocationChannelExtraMember(params: {
  channelId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const channelId = String(params.channelId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!channelId || !targetUserId) throw new Error('Dades no vàlides.')

  const channelSnap = await db.collection('channels').doc(channelId).get()
  if (!channelSnap.exists) throw new Error('Canal no trobat.')
  const channel = channelSnap.data() as ChannelRecord
  const source = String(channel.source || '')
  if (!isOpsLocationChannelSource(source)) {
    throw new Error('Canal no compatible.')
  }

  const canManage = await canManageOpsLocationChannelMembers({
    channel: { responsibleUserId: channel.responsibleUserId },
    userId: params.actorUserId,
    role: params.actorRole,
  })
  if (!canManage) throw new Error('Sense permís per afegir participants.')

  const extraMemberIds = new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  extraMemberIds.add(targetUserId)

  const userName = await resolveUserName(targetUserId)
  if (!userName) throw new Error('Usuari no trobat.')

  await db.collection('channels').doc(channelId).set(
    { chatExtraMemberIds: [...extraMemberIds], updatedAt: Date.now() },
    { merge: true }
  )

  await ensureChannelMember(channelId, targetUserId, userName)
  return { channelId, userId: targetUserId }
}

export async function removeOpsLocationChannelExtraMember(params: {
  channelId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const channelId = String(params.channelId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!channelId || !targetUserId) throw new Error('Dades no vàlides.')

  const channelSnap = await db.collection('channels').doc(channelId).get()
  if (!channelSnap.exists) throw new Error('Canal no trobat.')
  const channel = channelSnap.data() as ChannelRecord
  const source = String(channel.source || '')
  if (!isOpsLocationChannelSource(source)) {
    throw new Error('Canal no compatible.')
  }

  const extraMemberIds = new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  if (!extraMemberIds.has(targetUserId)) {
    throw new Error('Només es poden treure participants afegits manualment.')
  }

  const canManage = await canManageOpsLocationChannelMembers({
    channel: { responsibleUserId: channel.responsibleUserId },
    userId: params.actorUserId,
    role: params.actorRole,
  })
  if (!canManage) throw new Error('Sense permís per treure participants.')

  extraMemberIds.delete(targetUserId)
  await db.collection('channels').doc(channelId).set(
    { chatExtraMemberIds: [...extraMemberIds], updatedAt: Date.now() },
    { merge: true }
  )

  await db.collection('channelMembers').doc(`${channelId}_${targetUserId}`).delete()
  return { channelId, userId: targetUserId }
}

export function collectOpsLocationExtraMemberIds(channel: ChannelRecord) {
  return new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
}
