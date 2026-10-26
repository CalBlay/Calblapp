import { isDecoDepartment } from '@/lib/decoTicketsPermissions'

type ChannelLike = {
  source?: unknown
  ticketType?: unknown
  requesterUserId?: unknown
}

type UserLike = {
  id?: unknown
  department?: unknown
}

export function isRestrictedDecoTicketChannel(channel?: ChannelLike | null) {
  return (
    String(channel?.source || '').trim().toLowerCase() === 'maintenance_ticket' &&
    String(channel?.ticketType || '').trim().toLowerCase() === 'deco'
  )
}

/** Els xats de tickets Deco són privats per al creador i el departament Deco. */
export function canAccessRestrictedDecoTicketChannel(
  channel: ChannelLike,
  user: UserLike
) {
  if (!isRestrictedDecoTicketChannel(channel)) return true

  const userId = String(user.id || '').trim()
  const creatorId = String(channel.requesterUserId || '').trim()
  return Boolean(userId && userId === creatorId) || isDecoDepartment(String(user.department || ''))
}
