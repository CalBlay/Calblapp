'use client'

import { useEffect, useMemo, useState } from 'react'
import { mutate } from 'swr'
import useSWR from 'swr'
import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'
import { useRobaPersonalApiAccess } from '@/hooks/useRobaPersonalApiAccess'
import type { DeliveryRow, RequestRow, RobaPersonalRequestNotification } from '@/app/menu/roba-personal/robaPersonalTypes'

const SUMMARY_KEY = '/api/notifications/summary'
const DISMISSED_SYNTHETIC_STORAGE_KEY = 'roba-personal-dismissed-synthetic-notifications'
const ROBA_NOTIFICATION_TYPES = [
  'roba_personal_request',
  'roba_personal_sent_to_rrhh',
  'roba_personal_ready',
  'roba_personal_delivery_ack',
  'roba_personal_delivery_revised',
  'roba_personal_delivery_dispute',
] as const

type RobaDisplayedNotification = RobaPersonalRequestNotification & {
  synthetic?: boolean
}

const swrFetcher = (url: string) => fetch(url).then((r) => r.json())

async function fetchRobaNotifications(): Promise<RobaDisplayedNotification[]> {
  const responses = await Promise.all(
    ROBA_NOTIFICATION_TYPES.map(async (type) => {
      const response = await fetch(
        `/api/notifications?mode=list&type=${encodeURIComponent(type)}`,
        { cache: 'no-store' }
      )
      return response.json().catch(() => ({ notifications: [] }))
    })
  )

  const notifications = responses.flatMap((payload) =>
    Array.isArray(payload?.notifications) ? payload.notifications : []
  ) as RobaDisplayedNotification[]

  const deduped = new Map<string, RobaDisplayedNotification>()
  notifications.forEach((notification) => {
    const id = String(notification.id || '').trim()
    if (!id || deduped.has(id)) return
    deduped.set(id, notification)
  })

  return [...deduped.values()]
}

function buildRobaDisplayedNotifications(params: {
  notifications: RobaDisplayedNotification[]
  requests: RequestRow[]
  deliveries: DeliveryRow[]
  isFullUser: boolean
  isDeptLeadLimited: boolean
  isWorkerSelf: boolean
}): RobaDisplayedNotification[] {
  const { notifications, requests, deliveries, isFullUser, isDeptLeadLimited, isWorkerSelf } = params

  const pendingWorkerRequestIds = new Set(
    requests
      .filter((r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up')
      .map((r) => String(r.id || '').trim())
      .filter(Boolean)
  )
  const pendingWorkerDeliveryIds = new Set(
    deliveries
      .filter((d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt)
      .map((d) => String(d.id || '').trim())
      .filter(Boolean)
  )
  const pendingDeptRequestIds = new Set(
    requests
      .filter((r) => r.status === 'submitted' || r.status === 'prepared')
      .map((r) => String(r.id || '').trim())
      .filter(Boolean)
  )
  const pendingDeptDisputeIds = new Set(
    deliveries
      .filter((d) => d.workerReceiptCorrectionOpen === true)
      .map((d) => String(d.id || '').trim())
      .filter(Boolean)
  )
  const pendingFullRequestIds = new Set(
    requests
      .filter((r) => r.status === 'sent_to_rrhh')
      .map((r) => String(r.id || '').trim())
      .filter(Boolean)
  )

  const stored = notifications.filter((n) => {
    const dtype = String(n.type || '')
    const requestId = String(n.requestId || '').trim()
    const deliveryId = String(n.deliveryId || '').trim()

    if (isWorkerSelf) {
      if (dtype === 'roba_personal_ready') return pendingWorkerRequestIds.has(requestId)
      if (dtype === 'roba_personal_delivery_ack' || dtype === 'roba_personal_delivery_revised') {
        return pendingWorkerDeliveryIds.has(deliveryId)
      }
      return false
    }

    if (isDeptLeadLimited) {
      if (dtype === 'roba_personal_request' || dtype === 'roba_personal_ready') {
        return pendingDeptRequestIds.has(requestId)
      }
      if (dtype === 'roba_personal_delivery_dispute') return pendingDeptDisputeIds.has(deliveryId)
      return false
    }

    if (isFullUser) {
      return dtype === 'roba_personal_sent_to_rrhh' && pendingFullRequestIds.has(requestId)
    }

    return true
  })

  const storedRequestIds = new Set(stored.map((n) => String(n.requestId || '').trim()).filter(Boolean))
  const storedDeliveryIds = new Set(stored.map((n) => String(n.deliveryId || '').trim()).filter(Boolean))

  const synthetic: RobaDisplayedNotification[] = []

  if (isWorkerSelf) {
    requests
      .filter(
        (r) =>
          (r.status === 'ready_for_worker_delivery' || r.status === 'picked_up') &&
          !storedRequestIds.has(String(r.id || '').trim())
      )
      .forEach((r) => {
        synthetic.push({ id: `synthetic-request-${r.id}`, type: 'roba_personal_ready', synthetic: true })
      })

    deliveries
      .filter(
        (d) =>
          d.workerReceiptAckExpected === true &&
          !d.workerReceiptAckAt &&
          !storedDeliveryIds.has(String(d.id || '').trim())
      )
      .forEach((d) => {
        synthetic.push({ id: `synthetic-delivery-${d.id}`, type: 'roba_personal_delivery_ack', synthetic: true })
      })
  } else if (isDeptLeadLimited) {
    requests
      .filter(
        (r) =>
          (r.status === 'submitted' || r.status === 'prepared') &&
          !storedRequestIds.has(String(r.id || '').trim())
      )
      .forEach((r) => {
        synthetic.push({
          id: `synthetic-request-${r.id}`,
          type: r.status === 'prepared' ? 'roba_personal_ready' : 'roba_personal_request',
          synthetic: true,
        })
      })

    deliveries
      .filter(
        (d) =>
          d.workerReceiptCorrectionOpen === true &&
          !storedDeliveryIds.has(String(d.id || '').trim())
      )
      .forEach((d) => {
        synthetic.push({ id: `synthetic-dispute-${d.id}`, type: 'roba_personal_delivery_dispute', synthetic: true })
      })
  } else if (isFullUser) {
    requests
      .filter(
        (r) => r.status === 'sent_to_rrhh' && !storedRequestIds.has(String(r.id || '').trim())
      )
      .forEach((r) => {
        synthetic.push({ id: `synthetic-request-${r.id}`, type: 'roba_personal_sent_to_rrhh', synthetic: true })
      })
  }

  return [...stored, ...synthetic]
}

export async function markAdminUserRequestsRead() {
  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead', type: 'user_request' }),
  })
  await refreshNotificationSummary()
}

export async function refreshNotificationSummary() {
  await mutate(SUMMARY_KEY)
}

export function useAdminUserRequestCount() {
  const { summary, loading, error, refresh } = useNotificationSummaryContext()
  return {
    count: summary.adminUserRequests,
    loading,
    error,
    refresh,
    isAdmin: summary.isAdmin,
  }
}

export function useUserRequestResultCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.userRequestResults,
    loading,
    error,
  }
}

export function useTornNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.torn,
    loading,
    error,
  }
}

export function useRobaPersonalRequestNotificationCount() {
  const { loading, error } = useNotificationSummaryContext()
  const {
    isFullUser,
    isDeptLeadLimited,
    isWorkerSelf,
    canFetchRequests,
    canFetchDeliveries,
    userId,
  } = useRobaPersonalApiAccess()
  const [dismissedSyntheticIds, setDismissedSyntheticIds] = useState<string[]>([])

  const { data: notificationsData } = useSWR(
    userId ? 'roba-personal-notifications' : null,
    fetchRobaNotifications
  )
  const { data: requestsData } = useSWR<RequestRow[]>(
    canFetchRequests ? '/api/roba-personal/requests' : null,
    swrFetcher
  )
  const { data: deliveriesData } = useSWR<DeliveryRow[]>(
    canFetchDeliveries ? '/api/roba-personal/deliveries' : null,
    swrFetcher
  )

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

  const count = useMemo(() => {
    const notifications = (Array.isArray(notificationsData) ? notificationsData : []).filter(
      (n) =>
        !n.read &&
        ROBA_NOTIFICATION_TYPES.includes(String(n.type || '') as (typeof ROBA_NOTIFICATION_TYPES)[number])
    )

    return buildRobaDisplayedNotifications({
      notifications,
      requests: Array.isArray(requestsData) ? requestsData : [],
      deliveries: Array.isArray(deliveriesData) ? deliveriesData : [],
      isFullUser,
      isDeptLeadLimited,
      isWorkerSelf,
    }).filter((notification) => !notification.synthetic || !dismissedSyntheticIds.includes(String(notification.id || ''))).length
  }, [
    deliveriesData,
    dismissedSyntheticIds,
    isDeptLeadLimited,
    isFullUser,
    isWorkerSelf,
    notificationsData,
    requestsData,
  ])

  return {
    count,
    loading,
    error,
    isRrhh: isFullUser,
  }
}

export function useProjectAssignmentCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.projects,
    loading,
    error,
  }
}

export function useLogisticsReservationNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.logistics,
    loading,
    error,
  }
}

export function useEventComandaNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.events,
    loading,
    error,
  }
}
