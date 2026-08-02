'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { CheckCheck } from 'lucide-react'
import useSWR from 'swr'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'

type EventNotification = {
  id: string
  title?: string
  body?: string
  type?: string
  read?: boolean
  eventId?: string
  eventTitle?: string
  warehouseName?: string | null
  warehouseCode?: string | null
  url?: string
  createdAt?: number
}

const EVENT_NOTIFICATION_TYPES = ['event_comanda_warehouse', 'event_comanda_batch_sent'] as const

const fetchEventNotifications = async (): Promise<EventNotification[]> => {
  const responses = await Promise.all(
    EVENT_NOTIFICATION_TYPES.map(async (type) => {
      const response = await fetch(
        `/api/notifications?mode=list&type=${encodeURIComponent(type)}`,
        { cache: 'no-store' }
      )
      return response.json().catch(() => ({ notifications: [] }))
    })
  )

  const notifications = responses.flatMap((payload) =>
    Array.isArray(payload?.notifications) ? payload.notifications : []
  ) as EventNotification[]

  const deduped = new Map<string, EventNotification>()
  notifications.forEach((notification) => {
    const id = String(notification.id || '').trim()
    if (!id || deduped.has(id)) return
    deduped.set(id, notification)
  })

  return [...deduped.values()].sort((a, b) => (Number(b.createdAt || 0) - Number(a.createdAt || 0)))
}

function extractNotificationLabel(notification: EventNotification) {
  const warehouse = String(notification.warehouseName || notification.warehouseCode || '').trim()
  const eventTitle = String(notification.eventTitle || '').trim() || 'Esdeveniment'

  if (notification.type === 'event_comanda_batch_sent') {
    return {
      prefix: 'Enviada',
      primary: eventTitle,
      secondary: warehouse,
      detail: notification.body || notification.title || undefined,
    }
  }

  return {
    prefix: 'Magatzem',
    primary: eventTitle,
    secondary: warehouse,
    detail: notification.body || notification.title || undefined,
  }
}

function EventNotificationItems({
  notifications,
  onDismiss,
}: {
  notifications: EventNotification[]
  onDismiss: (notificationId: string) => Promise<void>
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()

  const openNotification = (notification: EventNotification) => {
    closeBell?.()

    const explicitUrl = String(notification.url || '').trim()
    if (explicitUrl) {
      router.push(explicitUrl)
      return
    }

    const eventId = String(notification.eventId || '').trim()
    if (eventId) {
      router.push(`/menu/events/${encodeURIComponent(eventId)}/comanda`)
      return
    }

    router.push('/menu/events')
  }

  return (
    <>
      {notifications.slice(0, 12).map((notification) => {
        const label = extractNotificationLabel(notification)
        return (
          <NotificationListItem
            key={notification.id}
            prefix={
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                {label.prefix}
              </span>
            }
            primary={label.primary}
            secondary={label.secondary || undefined}
            detail={label.detail}
            onOpen={() => openNotification(notification)}
            onDismiss={() => onDismiss(notification.id)}
          />
        )
      })}
    </>
  )
}

export default function EventNotificationsBell() {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string } | undefined)?.id || '').trim()
  const { data, mutate } = useSWR(userId ? 'event-notifications' : null, fetchEventNotifications)

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

  const notifications = useMemo(
    () =>
      (Array.isArray(data) ? data : []).filter(
        (notification) =>
          !notification.read &&
          EVENT_NOTIFICATION_TYPES.includes(
            String(notification.type || '') as (typeof EVENT_NOTIFICATION_TYPES)[number]
          )
      ),
    [data]
  )

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    for (const type of EVENT_NOTIFICATION_TYPES) {
      await markAllNotificationsRead(type)
    }
    await mutate()
  }

  return (
    <ModuleNotificationsBell
      title="Avisos d'esdeveniments"
      count={notifications.length}
      showWhenEmpty
      emptyMessage="Cap avís d'esdeveniments pendent"
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
      <EventNotificationItems notifications={notifications} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
