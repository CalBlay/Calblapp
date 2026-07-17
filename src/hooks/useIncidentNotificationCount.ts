'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

type IncidentNotification = {
  type?: string
  read?: boolean
  actionId?: string
}

type IncidentActionMineRow = {
  id: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useIncidentNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string } | undefined)?.id || '').trim()

  const { data: notificationsData } = useSWR(
    userId ? '/api/notifications?mode=list' : null,
    fetcher
  )
  const { data: mineData } = useSWR(
    userId ? '/api/incidents/actions/mine?status=pending' : null,
    fetcher
  )

  const count = useMemo(() => {
    const unreadNotifications = (Array.isArray(notificationsData?.notifications)
      ? notificationsData.notifications
      : []
    ).filter((notification: IncidentNotification) => !notification.read)

    const incidentNotifications = unreadNotifications.filter((notification: IncidentNotification) => {
      const type = String(notification.type || '').trim()
      return type === 'incident_marketing_9xx_new' || type === 'incident_action_assigned'
    })

    const notifiedActionIds = new Set(
      incidentNotifications
        .filter((notification: IncidentNotification) => String(notification.type || '') === 'incident_action_assigned')
        .map((notification: IncidentNotification) => String(notification.actionId || '').trim())
        .filter(Boolean)
    )

    const pendingActions = Array.isArray(mineData?.actions) ? (mineData.actions as IncidentActionMineRow[]) : []
    const syntheticPendingCount = pendingActions.filter((action) => !notifiedActionIds.has(String(action.id || '').trim())).length

    return incidentNotifications.length + syntheticPendingCount
  }, [mineData, notificationsData])

  return {
    count: Math.max(summary.incidents, count),
    loading,
    error,
  }
}
