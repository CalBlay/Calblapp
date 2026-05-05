'use client'

import { useEffect, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { subscribeToAblyEvent } from '@/lib/ablyClient'

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

export default function TransportReviewNotificationsBanner({
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

  const notifications = useMemo(
    () => {
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
    },
    [data]
  )

  const markRead = async (notificationId: string) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', notificationId }),
    })
    await mutate()
  }

  if (!userId || notifications.length === 0) return null

  return (
    <section className="rounded-[14px] border border-orange-200/80 bg-white px-2.5 py-2 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
          Avisos de transports
        </div>
        <div className="text-xs text-slate-500">{notifications.length} pendents</div>
      </div>
      <div className="space-y-1">
        {notifications.slice(0, 6).map((notification) => (
          <div
            key={notification.id}
            className="flex min-h-9 items-center gap-2 rounded-md border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-900">
                {notification.title || 'Revisio pendent'}
              </div>
              {notification.body ? (
                <div className="truncate text-xs text-slate-500">{notification.body}</div>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
              {String(notification.type || '') === 'transport_itv_due' ? 'ITV' : 'Revisio'}
            </span>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-orange-600 transition hover:bg-orange-50 hover:text-orange-700"
              aria-label="Marcar com a llegit"
              onClick={() => void markRead(notification.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
