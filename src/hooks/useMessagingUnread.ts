'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

type MessagingChannel = {
  unreadCount?: number | null
}

type MessagingChannelsResponse = {
  channels?: MessagingChannel[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useMessagingUnreadCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string } | undefined)?.id || '').trim()

  const { data } = useSWR<MessagingChannelsResponse>(
    userId ? '/api/messaging/channels?scope=mine' : null,
    fetcher
  )

  const count = useMemo(() => {
    const channels = Array.isArray(data?.channels) ? data.channels : []
    if (channels.length === 0) return summary.messaging
    return channels.reduce((total, channel) => {
      const unread = Number(channel?.unreadCount || 0)
      return total + (Number.isNaN(unread) ? 0 : unread)
    }, 0)
  }, [data?.channels, summary.messaging])

  return {
    count,
    loading,
    error,
  }
}
