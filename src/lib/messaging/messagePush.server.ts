type ChannelLike = {
  source?: string | null
  ticketId?: string | null
  eventId?: string | null
  projectId?: string | null
  name?: string | null
}

type MemberLike = {
  userId?: string | null
  userName?: string | null
}

const OPS_PUSH_SOURCES = new Set([
  'maintenance_ticket',
  'events',
  'event_comanda',
  'projects',
  'finques',
  'restaurants',
])

export function isOpsChannelSource(source: string) {
  return OPS_PUSH_SOURCES.has(String(source || '').trim().toLowerCase())
}

export function buildChannelPushUrl(channelId: string, channel?: ChannelLike | null) {
  const source = String(channel?.source || '').trim().toLowerCase()
  const ticketId = String(channel?.ticketId || '').trim()
  const eventId = String(channel?.eventId || '').trim()

  if (source === 'maintenance_ticket' && ticketId) {
    return `/menu/manteniment/tickets?ticketId=${encodeURIComponent(ticketId)}&ops=1`
  }

  if ((source === 'events' || source === 'event_comanda') && eventId) {
    return `/menu/events/${encodeURIComponent(eventId)}/comanda`
  }

  return `/menu/missatgeria?channel=${encodeURIComponent(channelId)}`
}

/** Resol @nom contra membres del canal (coincidència per nom, insensitive). */
export function resolveMentionedUserIds(params: {
  text: string
  members: MemberLike[]
  senderUserId?: string
}) {
  const text = String(params.text || '')
  const tokens = text.match(/@([^\s@]{1,40})/g) || []
  if (tokens.length === 0) return []

  const mentioned = new Set<string>()
  for (const token of tokens) {
    const query = token.slice(1).trim().toLowerCase()
    if (!query) continue

    const member = params.members.find((entry) => {
      const name = String(entry.userName || '').trim().toLowerCase()
      if (!name) return false
      return name === query || name.startsWith(query) || name.includes(query)
    })

    const userId = String(member?.userId || '').trim()
    if (!userId || userId === params.senderUserId) continue
    mentioned.add(userId)
  }

  return [...mentioned]
}

export function resolveMessagePushRecipients(params: {
  visibility: 'channel' | 'direct'
  targetUserId?: string
  senderUserId: string
  text: string
  channelSource: string
  members: MemberLike[]
  mutedUserIds: Set<string>
  regularRecipientIds: string[]
  shouldSendChannelPush: boolean
}) {
  const mentionBypass = new Set<string>()
  const pushUserIds = new Set<string>()

  if (params.visibility === 'direct') {
    const target = String(params.targetUserId || '').trim()
    if (target && target !== params.senderUserId) {
      mentionBypass.add(target)
      pushUserIds.add(target)
    }
  } else if (params.shouldSendChannelPush) {
    for (const uid of params.regularRecipientIds) {
      if (uid && uid !== params.senderUserId) pushUserIds.add(uid)
    }
  }

  if (isOpsChannelSource(params.channelSource)) {
    for (const uid of resolveMentionedUserIds({
      text: params.text,
      members: params.members,
      senderUserId: params.senderUserId,
    })) {
      mentionBypass.add(uid)
      pushUserIds.add(uid)
    }
  }

  const finalRecipients = [...pushUserIds].filter(
    (uid) => !params.mutedUserIds.has(uid) || mentionBypass.has(uid)
  )

  const isMentionPush =
    params.visibility === 'direct' || mentionBypass.size > 0

  return { finalRecipients, isMentionPush, mentionBypass }
}
