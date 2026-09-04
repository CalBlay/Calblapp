'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'
import { INCIDENT_NOTIFICATION_TYPES } from '@/lib/notifications/notificationTypes'
import {
  isIncidentActionNotificationVisible,
  isPendingIncidentActionStatus,
  type IncidentActionMineRow,
} from '@/lib/incidentActionsMine'
import { useSyntheticNotificationDismissals } from '@/hooks/useSyntheticNotificationDismissals'

type IncidentNotification = {
  type?: string
  read?: boolean
  actionId?: string
}

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
    const id = String((notification as { id?: string }).id || '').trim()
    if (!id || deduped.has(id)) return
    deduped.set(id, notification)
  })

  return [...deduped.values()]
}

export function useIncidentNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string } | undefined)?.id || '').trim()
  const { dismissedIds: dismissedSyntheticIds } =
    useSyntheticNotificationDismissals('incidents')

  const { data: notificationsData } = useSWR(userId ? 'incident-notifications' : null, fetchIncidentNotifications)
  const { data: mineData } = useSWR(
    userId ? '/api/incidents/actions/mine?status=all&scope=assigned' : null,
    fetcher
  )

  const count = useMemo(() => {
    const assignedActions = Array.isArray(mineData?.actions)
      ? (mineData.actions as IncidentActionMineRow[])
      : []
    const assignedActionIds = new Set(
      assignedActions.map((action) => String(action.id || '').trim()).filter(Boolean)
    )
    const unreadNotifications = (Array.isArray(notificationsData)
      ? notificationsData
      : []
    ).filter((notification: IncidentNotification) => !notification.read)

    const incidentNotifications = unreadNotifications.filter((notification: IncidentNotification) => {
      const type = String(notification.type || '').trim()
      if (type !== 'incident_marketing_9xx_new' && type !== 'incident_action_assigned') return false
      return isIncidentActionNotificationVisible(notification, assignedActionIds)
    })

    const notifiedActionIds = new Set(
      incidentNotifications
        .filter((notification: IncidentNotification) => String(notification.type || '') === 'incident_action_assigned')
        .map((notification: IncidentNotification) => String(notification.actionId || '').trim())
        .filter(Boolean)
    )

    const pendingActions = assignedActions.filter((action) =>
      isPendingIncidentActionStatus(action.status)
    )
    const syntheticPendingCount = pendingActions.filter((action) => {
      const actionId = String(action.id || '').trim()
      if (!actionId || notifiedActionIds.has(actionId)) return false
      return !dismissedSyntheticIds.includes(`synthetic-action-${actionId}`)
    }).length

    return incidentNotifications.length + syntheticPendingCount
  }, [dismissedSyntheticIds, mineData, notificationsData])

  const hasLiveCount = Array.isArray(notificationsData) && Array.isArray(mineData?.actions)

  return {
    count: hasLiveCount ? count : summary.incidents,
    loading,
    error,
  }
}
