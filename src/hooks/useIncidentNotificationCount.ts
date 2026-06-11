'use client'

import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

export function useIncidentNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.incidents,
    loading,
    error,
  }
}
