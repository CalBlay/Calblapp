'use client'

import { useNotificationSummaryContext } from '@/context/NotificationSummaryContext'

export function useSurveyNotificationCount() {
  const { summary, loading, error } = useNotificationSummaryContext()
  return {
    count: summary.surveys,
    loading,
    error,
  }
}
