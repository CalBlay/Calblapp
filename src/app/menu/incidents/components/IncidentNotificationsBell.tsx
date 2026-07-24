'use client'

import { useEffect, useMemo, useState } from 'react'
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
import {
  buildIncidentActionMineLabel,
  type IncidentActionMineRow,
} from '@/lib/incidentActionsMine'

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
  synthetic?: boolean
}

const DISMISSED_SYNTHETIC_STORAGE_KEY = 'incident-dismissed-synthetic-notifications'

const INCIDENT_TYPES = new Set<string>(INCIDENT_NOTIFICATION_TYPES)

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fetchIncidentNotifications = async (): Promise<IncidentNotification[]> => {
  const responses = await Promise.all(
    INCIDENT_NOTIFICATION_TYPES.map(async (type) => {
      const response = await fetch(
        `/api/notifications?mode=list&type=${encodeURIComponent(type)}`,
        { cache: 'no-store' }
      )
      return response.json().catch(() => ({ notifications: [] }))
    })
  )

  const notifications = responses.flatMap((payload) =>
    Array.isArray(payload?.notifications) ? payload.notifications : []
  ) as IncidentNotification[]

  const deduped = new Map<string, IncidentNotification>()
  notifications.forEach((notification) => {
    const id = String(notification.id || '').trim()
    if (!id || deduped.has(id)) return
    deduped.set(id, notification)
  })

  return [...deduped.values()].sort((a, b) => {
    const aCreatedAt =
      typeof (a as { createdAt?: unknown }).createdAt === 'number'
        ? Number((a as { createdAt?: unknown }).createdAt)
        : 0
    const bCreatedAt =
      typeof (b as { createdAt?: unknown }).createdAt === 'number'
        ? Number((b as { createdAt?: unknown }).createdAt)
        : 0
    return bCreatedAt - aCreatedAt
  })
}

const normalizeNotificationText = (value?: string | null) =>
  String(value || '')
    .replace(/Ã‚Â·/g, '\u00B7')
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .trim()

function extractNotificationLabel(notification: IncidentNotification) {
  const incidentNumber = normalizeNotificationText(notification.incidentNumber)
  const actionTitle = normalizeNotificationText(notification.actionTitle)
  const body = normalizeNotificationText(notification.body)
  const title = normalizeNotificationText(notification.title)
  const categoryLabel = normalizeNotificationText(notification.categoryLabel)
  const department = normalizeNotificationText(notification.department)

  if (notification.type === 'incident_action_assigned') {
    const primary = actionTitle || body || title || 'Accio assignada'
    const secondary = [incidentNumber ? `Incidencia ${incidentNumber}` : '', department]
      .filter(Boolean)
      .join(' \u00B7 ')
    return { prefix: 'Accio', primary, secondary }
  }

  const primary = incidentNumber || categoryLabel || body || title || 'Nova incidencia'
  const secondary = [categoryLabel, department].filter(Boolean).join(' \u00B7 ')
  return { prefix: 'Incidencia', primary, secondary }
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
            onDismiss={notification.synthetic ? undefined : () => onDismiss(notification.id)}
            dismissible={!notification.synthetic}
          />
        )
      })}
    </>
  )
}

export default function IncidentNotificationsBell() {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string })?.id || '').trim()
  const [dismissedSyntheticIds, setDismissedSyntheticIds] = useState<string[]>([])
  const { data, mutate } = useSWR(userId ? 'incident-notifications' : null, fetchIncidentNotifications)
  const { data: mineData, mutate: mutateMine } = useSWR(
    userId ? '/api/incidents/actions/mine?status=pending' : null,
    fetcher
  )

  useEffect(() => {
    if (!userId) return

    const client = getAblyClient(userId)
    const channel = client.channels.get(`user:${userId}:notifications`)
    const handler = () => {
      mutate().catch(() => {})
      mutateMine().catch(() => {})
    }

    channel.subscribe('created', handler)

    return () => {
      channel.unsubscribe('created', handler)
    }
  }, [userId, mutate, mutateMine])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(DISMISSED_SYNTHETIC_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      setDismissedSyntheticIds(Array.isArray(parsed) ? parsed.map((value) => String(value)) : [])
    } catch {
      setDismissedSyntheticIds([])
    }
  }, [])

  const notifications = useMemo(() => {
    const unreadNotifications = (Array.isArray(data) ? data : []).filter(
      (notification: IncidentNotification) =>
        !notification.read && INCIDENT_TYPES.has(String(notification.type || ''))
    )

    const pendingActions = Array.isArray(mineData?.actions)
      ? (mineData.actions as IncidentActionMineRow[])
      : []

    const notifiedActionIds = new Set(
      unreadNotifications
        .filter((notification: IncidentNotification) => notification.type === 'incident_action_assigned')
        .map((notification: IncidentNotification) => String(notification.actionId || '').trim())
        .filter(Boolean)
    )

    const syntheticNotifications: IncidentNotification[] = pendingActions
      .filter((action) => !notifiedActionIds.has(String(action.id || '').trim()))
      .map((action) => ({
        id: `synthetic-action-${action.id}`,
        type: 'incident_action_assigned',
        title: action.title || 'Accio assignada',
        body: buildIncidentActionMineLabel(action),
        incidentId: action.incidentId,
        incidentNumber: action.incident?.incidentNumber || null,
        actionId: action.id,
        actionTitle: action.title || '',
        department: action.department || action.incident?.department || null,
        synthetic: true,
      }))

    return [...unreadNotifications, ...syntheticNotifications].filter(
      (notification) =>
        !notification.synthetic || !dismissedSyntheticIds.includes(String(notification.id || ''))
    )
  }, [data, dismissedSyntheticIds, mineData])

  const dismiss = async (notificationId: string) => {
    const target = notifications.find((notification) => notification.id === notificationId)
    if (target?.synthetic) {
      const nextIds = [...new Set([...dismissedSyntheticIds, notificationId])]
      setDismissedSyntheticIds(nextIds)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DISMISSED_SYNTHETIC_STORAGE_KEY, JSON.stringify(nextIds))
      }
      return
    }

    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    for (const type of INCIDENT_NOTIFICATION_TYPES) {
      await markAllNotificationsRead(type)
    }
    const syntheticIds = notifications
      .filter((notification) => notification.synthetic)
      .map((notification) => notification.id)
    if (syntheticIds.length > 0) {
      const nextIds = [...new Set([...dismissedSyntheticIds, ...syntheticIds])]
      setDismissedSyntheticIds(nextIds)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DISMISSED_SYNTHETIC_STORAGE_KEY, JSON.stringify(nextIds))
      }
    }
    await mutate()
  }

  const hasStoredNotifications = notifications.some((notification) => !notification.synthetic)
  const hasSyntheticNotifications = notifications.some((notification) => notification.synthetic)

  return (
    <ModuleNotificationsBell
      title="Avisos d'incidencies"
      count={notifications.length}
      showWhenEmpty
      emptyMessage="Cap avis d'incidencies pendent"
      headerActions={
        hasStoredNotifications || hasSyntheticNotifications ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            onClick={() => void markAll()}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar tot
          </button>
        ) : undefined
      }
    >
      <IncidentNotificationItems notifications={notifications} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
