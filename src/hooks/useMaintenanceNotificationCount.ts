'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { getAblyClient } from '@/lib/ablyClient'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MAINTENANCE_NOTIFICATION_TYPES = new Set([
  'maintenance_ticket_new',
  'maintenance_ticket_assigned',
  'maintenance_ticket_validated',
])

export function useMaintenanceNotificationCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = String((session?.user as any)?.id || '').trim()

  const { data, error, mutate } = useSWR(isAuth ? '/api/notifications?mode=list' : null, fetcher, {
    refreshInterval: isAuth ? 15000 : 0,
  })

  useEffect(() => {
    if (!isAuth || !userId) return

    const client = getAblyClient()
    const channel = client.channels.get(`user:${userId}:notifications`)
    const handler = () => {
      mutate().catch(() => {})
    }

    channel.subscribe('created', handler)

    return () => {
      channel.unsubscribe('created', handler)
    }
  }, [isAuth, userId, mutate])

  const notifications = Array.isArray(data?.notifications) ? data.notifications : []
  const count = notifications.filter(
    (notification: any) =>
      !notification?.read && MAINTENANCE_NOTIFICATION_TYPES.has(String(notification?.type || ''))
  ).length

  return {
    count,
    loading: status === 'loading' || (isAuth && !data && !error),
    error,
  }
}
