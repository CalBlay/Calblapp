'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatTornsDayDate } from '@/lib/date-format'

const fetcher = (url: string) => fetch(url).then(r => r.json())

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
  return body.replace(/(?:\s+\d{2}\/\d{2}\/\d{2,4})+$/, '').replace(/\s+\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/, '').trim() || 'Esdeveniment'
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

export default function TornNotificationsBanner() {
  const router = useRouter()
  const { data, mutate } = useSWR('/api/notifications?mode=list', fetcher)

  const notifications = Array.isArray(data?.notifications) ? data.notifications : []
  const unread = sortTornNotificationsByDate(
    notifications.filter((n: TornNotification) =>
      !n.read && (n.type === 'torn' || n.type === 'NEW_SHIFTS')
    )
  )

  if (!unread.length) return null

  const openNotification = async (n: TornNotification) => {
    const date = n.eventDate || ''
    const eventId = n.eventId || ''
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', notificationId: n.id }),
    })
    await mutate()

    if (date) {
      router.push(`/menu/torns?open=${eventId}&date=${date}`)
    } else if (eventId) {
      router.push(`/menu/torns?open=${eventId}`)
    }
  }

  const markAll = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markAllRead', type: 'torn' }),
    })
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markAllRead', type: 'NEW_SHIFTS' }),
    })
    await mutate()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-3 mb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-slate-800">
          Torns nous o modificats
        </div>
        <Button
          variant="outline"
          className="text-sm min-h-11 w-full sm:w-auto touch-manipulation"
          onClick={markAll}
        >
          Marcar tot com llegit
        </Button>
      </div>
      <div className="space-y-2">
        {unread.map((n: TornNotification) => {
          const dateLabel = n.eventDate ? formatTornsDayDate(n.eventDate) : ''
          const subtitle = [n.title, dateLabel].filter(Boolean).join(' · ')
          return (
          <div
            key={n.id}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white px-3 py-3"
          >
            <div className="text-sm text-slate-700 min-w-0">
              <div className="font-semibold break-words">{notificationEventName(n)}</div>
              {subtitle ? (
                <div className="break-words text-slate-600 mt-0.5">{subtitle}</div>
              ) : null}
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-11 px-4 text-sm w-full sm:w-auto shrink-0 touch-manipulation"
              onClick={() => openNotification(n)}
            >
              Veure torn
            </Button>
          </div>
          )
        })}
      </div>
    </div>
  )
}
