'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { CheckCheck } from 'lucide-react'
import { getAblyClient } from '@/lib/ablyClient'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'

type MaintenanceNotification = {
  id: string
  title?: string
  body?: string
  type?: string
  read?: boolean
  ticketId?: string
  ticketCode?: string | null
  machine?: string | null
  location?: string | null
  plannedId?: string
  recordId?: string
}

type TicketStatusHistoryItem = {
  status?: string | null
  at?: number | null
}

type MaintenanceTicketResponse = {
  statusHistory?: TicketStatusHistoryItem[]
  plannedStart?: number | string | null
  assignedAt?: number | string | null
  createdAt?: number | string | null
}

const MAINTENANCE_NOTIFICATION_TYPES = new Set([
  'maintenance_ticket_new',
  'maintenance_ticket_assigned',
  'maintenance_ticket_resolved',
  'maintenance_ticket_pending_cap_validation',
  'maintenance_ticket_validated',
  'maintenance_ticket_reopened',
  'maintenance_ticket_stale',
  'maintenance_ticket_external_stale',
])

const DECO_NOTIFICATION_TYPES = new Set([
  'deco_ticket_new',
  'deco_ticket_assigned',
  'deco_ticket_resolved',
  'deco_ticket_pending_cap_validation',
  'deco_ticket_validated',
  'deco_ticket_reopened',
])

type NotificationModule = 'maintenance' | 'deco'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const buildWeekQuery = (value?: number | string | null) => {
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return `start=${format(start, 'yyyy-MM-dd')}&end=${format(end, 'yyyy-MM-dd')}`
}

const normalizeNotificationText = (value?: string | null) =>
  String(value || '')
    .replace(/Â·/g, '\u00B7')
    .replace(/â€™/g, "'")
    .trim()

function extractNotificationLabel(notification: MaintenanceNotification) {
  const code = String(notification.ticketCode || '').trim()
  const machine = normalizeNotificationText(notification.machine)
  const location = normalizeNotificationText(notification.location)
  const body = normalizeNotificationText(notification.body)
  const title = normalizeNotificationText(notification.title)
  const primaryBase = machine || location || body || title || 'Ticket'
  const primary = code ? `${code} \u00B7 ${primaryBase}` : primaryBase
  const secondary = location || body || machine || ''

  if (notification.type === 'maintenance_ticket_assigned' || notification.type === 'deco_ticket_assigned') {
    return { prefix: 'Assignat', primary, secondary }
  }
  if (notification.type === 'maintenance_ticket_resolved' || notification.type === 'deco_ticket_resolved') {
    return { prefix: 'Resolt', primary, secondary }
  }
  if (
    notification.type === 'maintenance_ticket_pending_cap_validation' ||
    notification.type === 'deco_ticket_pending_cap_validation'
  ) {
    return { prefix: 'Pendent validar', primary, secondary }
  }
  if (notification.type === 'maintenance_ticket_validated' || notification.type === 'deco_ticket_validated') {
    return { prefix: 'Validat', primary, secondary }
  }
  if (notification.type === 'maintenance_ticket_reopened' || notification.type === 'deco_ticket_reopened') {
    return { prefix: 'Reobert', primary, secondary }
  }
  if (notification.type === 'maintenance_ticket_stale') {
    return { prefix: 'Retard', primary, secondary }
  }
  if (notification.type === 'maintenance_ticket_external_stale') {
    return { prefix: 'Proveidor', primary, secondary }
  }
  return { prefix: 'Nou ticket', primary, secondary }
}

function MaintenanceNotificationItems({
  notifications,
  onDismiss,
  module,
}: {
  notifications: MaintenanceNotification[]
  onDismiss: (notificationId: string) => Promise<void>
  module: NotificationModule
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()

  const openNotification = async (notification: MaintenanceNotification) => {
    closeBell?.()

    if (notification.plannedId) {
      const params = new URLSearchParams()
      if (notification.recordId) params.set('recordId', notification.recordId)
      router.push(
        `/menu/manteniment/preventius/fulls/${encodeURIComponent(notification.plannedId)}${
          params.toString() ? `?${params.toString()}` : ''
        }`
      )
      return
    }

    const ticketId = String(notification.ticketId || '').trim()
    if (module === 'deco') {
      const query = ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : ''
      router.push(`/menu/deco/tickets${query}`)
      return
    }

    if (!ticketId) {
      router.push('/menu/manteniment/tickets')
      return
    }

    const query = new URLSearchParams({ ticketId })
    try {
      const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(ticketId)}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const json = await res.json()
        const ticket = (json?.ticket || null) as MaintenanceTicketResponse | null
        const validationAt = Array.isArray(ticket?.statusHistory)
          ? [...ticket.statusHistory]
              .filter((item) => item?.status === 'validat' || item?.status === 'fet')
              .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0))[0]?.at
          : null
        const baseDate =
          notification.type === 'maintenance_ticket_validated'
            ? validationAt || ticket?.plannedStart || ticket?.assignedAt || ticket?.createdAt
            : ticket?.plannedStart || ticket?.assignedAt || ticket?.createdAt
        const weekQuery = buildWeekQuery(baseDate)
        if (weekQuery) {
          const weekParams = new URLSearchParams(weekQuery)
          weekParams.forEach((value, key) => query.set(key, value))
        }
      }
    } catch {
      // keep fallback route below
    }

    if (notification.type === 'maintenance_ticket_assigned') {
      router.push(`/menu/manteniment/preventius/fulls?${query.toString()}`)
      return
    }

    router.push(`/menu/manteniment/tickets?${query.toString()}`)
  }

  return (
    <>
      {notifications.slice(0, 12).map((notification: MaintenanceNotification) => {
        const label = extractNotificationLabel(notification)
        return (
          <NotificationListItem
            key={notification.id}
            prefix={
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                {label.prefix}
              </span>
            }
            primary={label.primary}
            secondary={label.secondary || undefined}
            onOpen={() => void openNotification(notification)}
            onDismiss={() => onDismiss(notification.id)}
          />
        )
      })}
    </>
  )
}

export default function MaintenanceNotificationsBell({
  showWhenEmpty = true,
  module = 'maintenance',
}: {
  /** Mantenir visible la campaneta encara sense avisos pendents (creadors de tickets). */
  showWhenEmpty?: boolean
  module?: NotificationModule
}) {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string })?.id || '').trim()
  const { data, mutate } = useSWR(userId ? '/api/notifications?mode=list' : null, fetcher)

  useEffect(() => {
    if (!userId) return

    const client = getAblyClient(userId)
    const channel = client.channels.get(`user:${userId}:notifications`)
    const handler = () => {
      mutate().catch(() => {})
    }

    channel.subscribe('created', handler)

    return () => {
      channel.unsubscribe('created', handler)
    }
  }, [userId, mutate])

  const notificationTypes = module === 'deco' ? DECO_NOTIFICATION_TYPES : MAINTENANCE_NOTIFICATION_TYPES
  const notifications = useMemo(
    () =>
      (Array.isArray(data?.notifications) ? data.notifications : []).filter(
        (notification: MaintenanceNotification) =>
          !notification.read && notificationTypes.has(String(notification.type || ''))
      ),
    [data, notificationTypes]
  )

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    for (const type of notificationTypes) {
      await markAllNotificationsRead(type)
    }
    await mutate()
  }

  return (
    <ModuleNotificationsBell
      title={module === 'deco' ? 'Avisos d’Imatge-Deco' : 'Avisos de manteniment'}
      count={notifications.length}
      showWhenEmpty={showWhenEmpty}
      emptyMessage={module === 'deco' ? 'Cap avís d’Imatge-Deco pendent' : 'Cap avís de manteniment pendent'}
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
      <MaintenanceNotificationItems notifications={notifications} onDismiss={dismiss} module={module} />
    </ModuleNotificationsBell>
  )
}
