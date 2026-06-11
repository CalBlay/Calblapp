'use client'

import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

export function useMessagingUnreadCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.messaging,
    loading,
    error,
  }
}
