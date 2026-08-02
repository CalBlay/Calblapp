type UnreadMemberFields = {
  unreadCount?: unknown
  directUnreadCount?: unknown
  channelUnreadCount?: unknown
}

export function resolveChannelUnreadCounts(member: UnreadMemberFields | null | undefined) {
  const directUnreadCount = Math.max(0, Number(member?.directUnreadCount || 0))
  const storedChannel = Number(member?.channelUnreadCount)
  const totalUnread = Math.max(0, Number(member?.unreadCount || 0))
  const channelUnreadCount = Number.isFinite(storedChannel)
    ? Math.max(0, storedChannel)
    : Math.max(0, totalUnread - directUnreadCount)

  return {
    directUnreadCount,
    channelUnreadCount,
    totalUnread: Math.max(totalUnread, directUnreadCount + channelUnreadCount),
  }
}

export function buildUnreadIncrement(
  visibility: 'channel' | 'direct',
  member: UnreadMemberFields | null | undefined
) {
  const current = resolveChannelUnreadCounts(member)
  if (visibility === 'direct') {
    return {
      unreadCount: current.totalUnread + 1,
      directUnreadCount: current.directUnreadCount + 1,
      channelUnreadCount: current.channelUnreadCount,
    }
  }

  return {
    unreadCount: current.totalUnread + 1,
    directUnreadCount: current.directUnreadCount,
    channelUnreadCount: current.channelUnreadCount + 1,
  }
}

export function buildUnreadDecrement(
  visibility: 'channel' | 'direct',
  member: UnreadMemberFields | null | undefined
) {
  const current = resolveChannelUnreadCounts(member)
  if (visibility === 'direct') {
    return {
      unreadCount: Math.max(0, current.totalUnread - 1),
      directUnreadCount: Math.max(0, current.directUnreadCount - 1),
      channelUnreadCount: current.channelUnreadCount,
    }
  }

  return {
    unreadCount: Math.max(0, current.totalUnread - 1),
    directUnreadCount: current.directUnreadCount,
    channelUnreadCount: Math.max(0, current.channelUnreadCount - 1),
  }
}
