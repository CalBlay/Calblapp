'use client'

import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { normalizeRole } from '@/lib/roles'
import { useEffect } from 'react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import { useRobaPersonalApiAccess } from '@/hooks/useRobaPersonalApiAccess'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const robaListFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

const robaListSwrOptions = {
  onErrorRetry: (
    error: Error & { status?: number },
    _key: string,
    _config: unknown,
    revalidate: (opts: { retryCount: number }) => void,
    { retryCount }: { retryCount: number }
  ) => {
    if (error.status === 403 || error.status === 401) return
    if (retryCount >= 2) return
    setTimeout(() => revalidate({ retryCount }), 3000)
  },
} as const

type SessionUser = {
  id?: string
  role?: string
  department?: string
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
}
type NotificationListItem = { read?: boolean; type?: string }
type RobaRequestListItem = { status?: string }
type RobaDeliveryListItem = {
  workerReceiptAckExpected?: boolean
  workerReceiptAckAt?: string | null
  workerReceiptCorrectionOpen?: boolean
}

export function useAdminUserRequestCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const role = normalizeRole((session?.user as SessionUser | undefined)?.role || '')
  const isAdmin = role === 'admin'

  const url = isAuth && isAdmin
    ? '/api/notifications?mode=count&type=user_request'
    : null

  const { data, error, mutate } = useSWR(url, fetcher, {
    refreshInterval: isAuth && isAdmin ? 15000 : 0,
  })

  useEffect(() => {
    if (!isAuth || !isAdmin) return

    const handler = () => {
      mutate().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: 'admin:user-requests',
      eventName: 'created',
      handler,
    })
  }, [isAuth, isAdmin, mutate])

  return {
    count: data?.count ?? 0,
    loading: status === 'loading' || (isAuth && isAdmin && !data && !error),
    error,
    refresh: mutate,
    isAdmin,
  }
}

export async function markAdminUserRequestsRead() {
  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead', type: 'user_request' }),
  })
}

export function useUserRequestResultCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = (session?.user as SessionUser | undefined)?.id

  const url = isAuth
    ? '/api/notifications?mode=count&type=user_request_result'
    : null

  const { data, error, mutate } = useSWR(url, fetcher, {
    refreshInterval: isAuth ? 15000 : 0,
  })

  useEffect(() => {
    if (!isAuth || !userId) return

    const handler = () => {
      mutate().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [isAuth, userId, mutate])

  return {
    count: data?.count ?? 0,
    loading: status === 'loading' || (isAuth && !data && !error),
    error,
  }
}

export function useTornNotificationCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = (session?.user as SessionUser | undefined)?.id

  const url = isAuth ? '/api/notifications?mode=list' : null

  const { data, error, mutate } = useSWR(url, fetcher, {
    refreshInterval: isAuth ? 15000 : 0,
  })

  useEffect(() => {
    if (!isAuth || !userId) return

    const handler = () => {
      mutate().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [isAuth, userId, mutate])

  return {
    count: (() => {
      const notifications = Array.isArray(data?.notifications) ? data.notifications : []
      return notifications.filter((n: NotificationListItem) =>
        !n.read && (n.type === 'torn' || n.type === 'NEW_SHIFTS')
      ).length
    })(),
    loading: status === 'loading' || (isAuth && !data && !error),
    error,
  }
}

export function useRobaPersonalRequestNotificationCount() {
  const { status } = useSession()
  const {
    isAuth,
    userId,
    isFullUser,
    isDeptLeadLimited,
    isWorkerSelf,
    canFetchRequests,
    canFetchDeliveries,
  } = useRobaPersonalApiAccess()

  const requestsUrl = canFetchRequests ? '/api/roba-personal/requests' : null
  const deliveriesUrl = canFetchDeliveries ? '/api/roba-personal/deliveries' : null

  const { data: requestsData, error: requestsError, mutate: mutateRequests } = useSWR(
    requestsUrl,
    robaListFetcher,
    {
      refreshInterval: isAuth ? 15000 : 0,
      ...robaListSwrOptions,
    }
  )
  const { data: deliveriesData, error: deliveriesError, mutate: mutateDeliveries } = useSWR(
    deliveriesUrl,
    robaListFetcher,
    {
      refreshInterval: isAuth ? 15000 : 0,
      ...robaListSwrOptions,
    }
  )

  useEffect(() => {
    if (!isAuth || !userId || (!canFetchRequests && !canFetchDeliveries)) return

    const handler = () => {
      if (canFetchRequests) mutateRequests().catch(() => {})
      if (canFetchDeliveries) mutateDeliveries().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [
    isAuth,
    userId,
    canFetchRequests,
    canFetchDeliveries,
    mutateRequests,
    mutateDeliveries,
  ])

  return {
    count: (() => {
      const requests = Array.isArray(requestsData) ? (requestsData as RobaRequestListItem[]) : []
      const deliveries = Array.isArray(deliveriesData)
        ? (deliveriesData as RobaDeliveryListItem[])
        : []

      if (isWorkerSelf) {
        const requestsPending = requests.filter(
          (r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up'
        ).length
        const deliveriesPending = deliveries.filter(
          (d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
        ).length
        return requestsPending + deliveriesPending
      }

      if (isDeptLeadLimited) {
        const requestsPending = requests.filter(
          (r) => r.status === 'submitted' || r.status === 'prepared'
        ).length
        const disputesPending = deliveries.filter((d) => d.workerReceiptCorrectionOpen === true)
          .length
        return requestsPending + disputesPending
      }

      if (isFullUser) {
        return requests.filter((r) => r.status === 'sent_to_rrhh').length
      }

      return 0
    })(),
    loading:
      status === 'loading' ||
      (canFetchRequests && !requestsData && !requestsError) ||
      (canFetchDeliveries && !deliveriesData && !deliveriesError),
    error: requestsError || deliveriesError,
    isRrhh: isFullUser,
  }
}

export function useProjectAssignmentCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = (session?.user as SessionUser | undefined)?.id

  const url = isAuth
    ? '/api/notifications?mode=list'
    : null

  const { data, error, mutate } = useSWR(url, fetcher, {
    refreshInterval: isAuth ? 15000 : 0,
  })

  useEffect(() => {
    if (!isAuth || !userId) return

    const handler = () => {
      mutate().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [isAuth, userId, mutate])

  return {
    count: (() => {
      const notifications = Array.isArray(data?.notifications) ? data.notifications : []
      return notifications.filter((n: NotificationListItem) =>
        !n.read &&
        (
          n.type === 'project_assignment' ||
          n.type === 'project_block_assignment' ||
          n.type === 'project_task_assignment'
        )
      ).length
    })(),
    loading: status === 'loading' || (isAuth && !data && !error),
    error,
  }
}

export function useLogisticsReservationNotificationCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = (session?.user as SessionUser | undefined)?.id

  const url = isAuth ? '/api/notifications?mode=list' : null

  const { data, error, mutate } = useSWR(url, fetcher, {
    refreshInterval: isAuth ? 15000 : 0,
  })

  useEffect(() => {
    if (!isAuth || !userId) return

    const handler = () => {
      mutate().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [isAuth, userId, mutate])

  return {
    count: (() => {
      const notifications = Array.isArray(data?.notifications) ? data.notifications : []
      return notifications.filter(
        (n: NotificationListItem) =>
          !n.read &&
          (n.type === 'commercial_vehicle_request' ||
            n.type === 'commercial_vehicle_validation')
      ).length
    })(),
    loading: status === 'loading' || (isAuth && !data && !error),
    error,
  }
}
