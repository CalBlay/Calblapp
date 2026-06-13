'use client'

import { useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import ModuleNotificationsBell from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markNotificationRead } from '@/lib/notifications/markRead'

type TransportReviewNotification = {
  id: string
  title?: string
  body?: string
  type?: string
  read?: boolean
  transportId?: string
  plate?: string | null
  reviewAlertType?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function TransportReviewNotificationsBell({
  refreshSignal,
}: {
  refreshSignal?: number
}) {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string })?.id || '').trim()
  const { data, mutate } = useSWR(userId ? '/api/notifications?mode=list' : null, fetcher)

  useEffect(() => {
    if (!userId) return
    const handler = () => {
      mutate().catch(() => {})
    }
    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [userId, mutate])

  useEffect(() => {
    if (!userId || !refreshSignal) return
    mutate().catch(() => {})
  }, [userId, refreshSignal, mutate])

  const notifications = useMemo(() => {
    const raw = (Array.isArray(data?.notifications) ? data.notifications : []).filter(
      (n: TransportReviewNotification) =>
        !n.read &&
        (String(n.type || '') === 'transport_review_due' ||
          String(n.type || '') === 'transport_itv_due')
    )

    const deduped = new Map<string, TransportReviewNotification>()
    raw.forEach((notification: TransportReviewNotification) => {
      const key = [
        String(notification.type || ''),
        String(notification.transportId || ''),
        String(notification.reviewAlertType || ''),
        String(notification.body || ''),
      ].join('::')
      if (!deduped.has(key)) deduped.set(key, notification)
    })

    return Array.from(deduped.values())
  }, [data])

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  return (
    <ModuleNotificationsBell title="Avisos de transports" count={notifications.length}>
      {notifications.slice(0, 12).map((notification) => (
        <NotificationListItem
          key={notification.id}
          prefix={
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
              {String(notification.type || '') === 'transport_itv_due' ? 'ITV' : 'Revisio'}
            </span>
          }
          primary={notification.title || 'Revisio pendent'}
          secondary={notification.body || undefined}
          onDismiss={() => dismiss(notification.id)}
        />
      ))}
    </ModuleNotificationsBell>
  )
}
