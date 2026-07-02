'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { CheckCheck } from 'lucide-react'
import { getAblyClient } from '@/lib/ablyClient'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'
import { INCIDENT_NOTIFICATION_TYPES } from '@/lib/notifications/notificationTypes'
import { INCIDENTS_ACCIONS_PATH, INCIDENTS_UI_PATH } from '@/lib/incidentsPermissions'

type IncidentNotification = {
  id: string
  title?: string
  body?: string
  type?: string
  read?: boolean
  incidentId?: string
  incidentNumber?: string | null
  actionId?: string
  actionTitle?: string
  department?: string | null
  eventCode?: string | null
  categoryLabel?: string | null
}

const INCIDENT_TYPES = new Set<string>(INCIDENT_NOTIFICATION_TYPES)

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const normalizeNotificationText = (value?: string | null) =>
  String(value || '')
    .replace(/Â·/g, '\u00B7')
    .replace(/â€™/g, "'")
    .trim()

function extractNotificationLabel(notification: IncidentNotification) {
  const incidentNumber = normalizeNotificationText(notification.incidentNumber)
  const actionTitle = normalizeNotificationText(notification.actionTitle)
  const body = normalizeNotificationText(notification.body)
  const title = normalizeNotificationText(notification.title)
  const categoryLabel = normalizeNotificationText(notification.categoryLabel)
  const department = normalizeNotificationText(notification.department)

  if (notification.type === 'incident_action_assigned') {
    const primary = actionTitle || body || title || 'Acció assignada'
    const secondary = [incidentNumber ? `Incidència ${incidentNumber}` : '', department]
      .filter(Boolean)
      .join(' \u00B7 ')
    return { prefix: 'Acció', primary, secondary }
  }

  const primary =
    incidentNumber ||
    categoryLabel ||
    body ||
    title ||
    'Nova incidència'
  const secondary = [categoryLabel, department].filter(Boolean).join(' \u00B7 ')
  return { prefix: 'Incidència', primary, secondary }
}

function incidentBoardHref(incidentId: string) {
  const qs = new URLSearchParams({
    incidentId,
    ops: '1',
    dateMode: 'all',
  })
  return `${INCIDENTS_UI_PATH}?${qs.toString()}`
}

function IncidentNotificationItems({
  notifications,
  onDismiss,
}: {
  notifications: IncidentNotification[]
  onDismiss: (notificationId: string) => Promise<void>
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()

  const openNotification = (notification: IncidentNotification) => {
    closeBell?.()

    const incidentId = String(notification.incidentId || '').trim()
    if (notification.type === 'incident_action_assigned') {
      if (incidentId) {
        router.push(incidentBoardHref(incidentId))
        return
      }
      router.push(INCIDENTS_ACCIONS_PATH)
      return
    }

    if (incidentId) {
      router.push(incidentBoardHref(incidentId))
      return
    }

    router.push(INCIDENTS_UI_PATH)
  }

  return (
    <>
      {notifications.slice(0, 12).map((notification) => {
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
            detail={!label.secondary ? notification.title || undefined : undefined}
            onOpen={() => openNotification(notification)}
            onDismiss={() => onDismiss(notification.id)}
          />
        )
      })}
    </>
  )
}

export default function IncidentNotificationsBell() {
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

  const notifications = useMemo(
    () =>
      (Array.isArray(data?.notifications) ? data.notifications : []).filter(
        (notification: IncidentNotification) =>
          !notification.read && INCIDENT_TYPES.has(String(notification.type || ''))
      ),
    [data]
  )

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    for (const type of INCIDENT_NOTIFICATION_TYPES) {
      await markAllNotificationsRead(type)
    }
    await mutate()
  }

  return (
    <ModuleNotificationsBell
      title="Avisos d'incidències"
      count={notifications.length}
      showWhenEmpty
      emptyMessage="Cap avís d'incidències pendent"
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
      <IncidentNotificationItems notifications={notifications} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
