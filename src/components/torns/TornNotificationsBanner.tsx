'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function TornNotificationsBanner() {
  const router = useRouter()
  const { data, mutate } = useSWR('/api/notifications?mode=list', fetcher)

  const notifications = Array.isArray(data?.notifications) ? data.notifications : []
  const unread = notifications.filter((n: any) =>
    !n.read && (n.type === 'torn' || n.type === 'NEW_SHIFTS')
  )

  if (!unread.length) return null

  const openNotification = async (n: any) => {
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
        {unread.map((n: any) => (
          <div
            key={n.id}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white px-3 py-3"
          >
            <div className="text-sm text-slate-700 min-w-0">
              <div className="font-semibold break-words">{n.title || 'Nou torn'}</div>
              <div className="break-words text-slate-600 mt-0.5">{n.body || ''}</div>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-11 px-4 text-sm w-full sm:w-auto shrink-0 touch-manipulation"
              onClick={() => openNotification(n)}
            >
              Veure torn
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
