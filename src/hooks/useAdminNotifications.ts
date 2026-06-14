'use client'

import { mutate } from 'swr'
import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'
import { useRobaPersonalApiAccess } from '@/hooks/useRobaPersonalApiAccess'

const SUMMARY_KEY = '/api/notifications/summary'

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
  const { summary, loading, error } = useNotificationSummaryContext()
  const { isFullUser } = useRobaPersonalApiAccess()
  return {
    count: summary.robaPersonal,
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
