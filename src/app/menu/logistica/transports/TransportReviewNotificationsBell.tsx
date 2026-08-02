'use client'

import { useEffect, useMemo } from 'react'
import { CheckCheck } from 'lucide-react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import ModuleNotificationsBell from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'

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
const TRANSPORT_NOTIFICATION_TYPES = ['transport_review_due', 'transport_itv_due'] as const

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
        TRANSPORT_NOTIFICATION_TYPES.includes(
          String(n.type || '') as (typeof TRANSPORT_NOTIFICATION_TYPES)[number]
        )
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

  const markAll = async () => {
    for (const type of TRANSPORT_NOTIFICATION_TYPES) {
      await markAllNotificationsRead(type)
    }
    await mutate()
  }

  return (
    <ModuleNotificationsBell
      title="Avisos de transports"
      count={notifications.length}
      headerActions={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
          onClick={() => void markAll()}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Marcar tot
        </button>
      }
    >
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
