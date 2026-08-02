'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'
import { formatTornsDayDate } from '@/lib/date-format'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TornNotification = {
  id: string
  read?: boolean
  type?: string
  eventDate?: string
  eventId?: string
  title?: string
  body?: string
  eventName?: string
  createdAt?: number
}

function notificationEventName(n: TornNotification): string {
  const stored = String(n.eventName || '').trim()
  if (stored) return stored
  const body = String(n.body || '').trim()
  if (!body) return 'Esdeveniment'
  return (
    body
      .replace(/(?:\s+\d{2}\/\d{2}\/\d{2,4})+$/, '')
      .replace(/\s+\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/, '')
      .trim() || 'Esdeveniment'
  )
}

function sortTornNotificationsByDate(items: TornNotification[]): TornNotification[] {
  return [...items].sort((a, b) => {
    const dateA = String(a.eventDate || '').slice(0, 10)
    const dateB = String(b.eventDate || '').slice(0, 10)
    const byDate = dateA.localeCompare(dateB)
    if (byDate !== 0) return byDate
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
}

function TornNotificationItems({
  unread,
  onDismiss,
}: {
  unread: TornNotification[]
  onDismiss: (notificationId: string) => Promise<void>
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()

  const openNotification = (n: TornNotification) => {
    const date = n.eventDate || ''
    const eventId = n.eventId || ''
    closeBell?.()

    if (date) {
      router.push(`/menu/torns?open=${eventId}&date=${date}`)
    } else if (eventId) {
      router.push(`/menu/torns?open=${eventId}`)
    }
  }

  return (
    <>
      {unread.map((n: TornNotification) => {
        const dateLabel = n.eventDate ? formatTornsDayDate(n.eventDate) : ''
        const subtitle = [n.title, dateLabel].filter(Boolean).join(' · ')
        return (
          <NotificationListItem
            key={n.id}
            prefix={
              <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-800">
                Torn
              </span>
            }
            primary={notificationEventName(n)}
            secondary={subtitle || undefined}
            onOpen={() => openNotification(n)}
            onDismiss={() => onDismiss(n.id)}
          />
        )
      })}
    </>
  )
}

export default function TornNotificationsBell() {
  const { data, mutate } = useSWR('/api/notifications?mode=list', fetcher)

  const notifications = Array.isArray(data?.notifications) ? data.notifications : []
  const unread = sortTornNotificationsByDate(
    notifications.filter(
      (n: TornNotification) => !n.read && (n.type === 'torn' || n.type === 'NEW_SHIFTS')
    )
  )

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    await markAllNotificationsRead('torn')
    await markAllNotificationsRead('NEW_SHIFTS')
    await mutate()
  }

  return (
    <ModuleNotificationsBell
      title="Torns nous o modificats"
      count={unread.length}
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
      <TornNotificationItems unread={unread} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
