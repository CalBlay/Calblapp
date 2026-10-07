'use client'

import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

export function useMaintenanceNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.maintenance,
    loading,
    error,
  }
}

export function useDecoNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.deco,
    loading,
    error,
  }
}
