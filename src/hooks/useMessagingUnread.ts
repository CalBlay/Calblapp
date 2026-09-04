'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

type MessagingChannel = {
  unreadCount?: number | null
  source?: string | null
  status?: string | null
  visibleUntil?: number | null
}

type MessagingChannelsResponse = {
  channels?: MessagingChannel[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const OPS_VISIBLE_SOURCES = new Set(['finques', 'restaurants', 'projects', 'events', 'spaces'])

export function useMessagingUnreadCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string } | undefined)?.id || '').trim()

  const { data } = useSWR<MessagingChannelsResponse>(
    userId ? '/api/messaging/channels?scope=mine' : null,
    fetcher
  )

  const count = useMemo(() => {
    if (data === undefined) return summary.messaging
    const channels = Array.isArray(data?.channels) ? data.channels : []
    const now = Date.now()
    return channels.filter((channel) => {
      const source = String(channel.source || '').trim()
      if (!OPS_VISIBLE_SOURCES.has(source)) return false
      if (String(channel.status || '').toLowerCase() === 'archived') return false
      if (source === 'events' && Number(channel.visibleUntil || 0) > 0) {
        return now <= Number(channel.visibleUntil)
      }
      return true
    }).reduce((total, channel) => {
      const unread = Number(channel?.unreadCount || 0)
      return total + (Number.isNaN(unread) ? 0 : unread)
    }, 0)
  }, [data, summary.messaging])

  return {
    count,
    loading,
    error,
  }
}
