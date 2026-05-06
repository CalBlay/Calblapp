'use client'

import useSWR from 'swr'
import { useSession } from 'next-auth/react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type MessagingChannel = { unreadCount?: number | string | null }

export function useMessagingUnreadCount() {
  const { status } = useSession()
  const isAuth = status === 'authenticated'

  const { data, error } = useSWR(
    isAuth ? '/api/messaging/channels?scope=mine' : null,
    fetcher,
    { refreshInterval: isAuth ? 15000 : 0 }
  )

  const channels = Array.isArray(data?.channels) ? data.channels : []
  const count = channels.reduce((acc: number, c: MessagingChannel) => {
    const n = Number(c?.unreadCount || 0)
    return acc + (Number.isNaN(n) ? 0 : n)
  }, 0)

  return {
    count,
    loading: status === 'loading' || (isAuth && !data && !error),
    error,
  }
}
