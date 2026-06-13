'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((res) => res.json())

export type ProjectActivityRoom = {
  roomId: string
  roomName: string
  roomKind: 'general' | 'block'
  blockId: string
  opsChannelId: string
  unreadCount: number
  directUnreadCount?: number
  channelUnreadCount?: number
  hasMessagesToRead?: boolean
  hasChannelMessagesToRead?: boolean
  lastMessagePreview: string
  lastMessageAt: number
  lastSenderName: string
}

export type ProjectActivityFeedItem = {
  roomId: string
  roomName: string
  roomKind: 'general' | 'block'
  blockId: string
  messageId: string
  senderName: string
  bodyPreview: string
  createdAt: number
}

type ActivityResponse = {
  rooms?: ProjectActivityRoom[]
  feed?: ProjectActivityFeedItem[]
  totalUnread?: number
  hasMessagesToRead?: boolean
  generalDirectUnread?: number
  generalHasChannelMessagesToRead?: boolean
  error?: string
}

export function useProjectActivity(projectId: string, enabled = true, pollWhileOpen = false) {
  const { data, error, isLoading, mutate } = useSWR<ActivityResponse>(
    enabled && projectId ? `/api/projects/${projectId}/activity` : null,
    fetcher,
    {
      refreshInterval: pollWhileOpen ? 120000 : 0,
      revalidateOnFocus: true,
      dedupingInterval: 15000,
    }
  )

  const rooms = Array.isArray(data?.rooms) ? data.rooms : []
  const feed = Array.isArray(data?.feed) ? data.feed : []
  const totalUnread = Number(data?.totalUnread || 0)
  const hasMessagesToRead = Boolean(data?.hasMessagesToRead)
  const generalDirectUnread = Number(data?.generalDirectUnread || 0)
  const generalHasChannelMessagesToRead = Boolean(data?.generalHasChannelMessagesToRead)

  const unreadByBlockId = rooms.reduce<Record<string, number>>((acc, room) => {
    if (room.roomKind === 'block' && room.blockId) {
      acc[room.blockId] = room.unreadCount
    }
    return acc
  }, {})

  const generalRoom = rooms.find((room) => room.roomKind === 'general') || null
  const generalUnread = generalRoom?.unreadCount || 0
  const generalChannelUnread = generalRoom?.channelUnreadCount ?? Math.max(0, generalUnread - generalDirectUnread)

  return {
    rooms,
    feed,
    totalUnread,
    hasMessagesToRead,
    generalDirectUnread,
    generalHasChannelMessagesToRead,
    generalRoom,
    generalUnread,
    generalChannelUnread,
    unreadByBlockId,
    loading: isLoading,
    error: error || data?.error || '',
    refresh: mutate,
  }
}
