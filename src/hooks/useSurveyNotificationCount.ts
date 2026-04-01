'use client'

import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { normalizeRole } from '@/lib/roles'
import { useEffect } from 'react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useSurveyNotificationCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = String((session?.user as any)?.id || '').trim()
  const role = normalizeRole(String((session?.user as any)?.role || ''))
  const canRespondSurveys = Boolean((session?.user as any)?.canRespondSurveys)
  const canAccess = canRespondSurveys || ['admin', 'direccio', 'cap'].includes(role)

  const { data, error, mutate } = useSWR(
    isAuth && canAccess ? '/api/quadrants/surveys/mine' : null,
    fetcher,
    { refreshInterval: isAuth && canAccess ? 15000 : 0 }
  )

  useEffect(() => {
    if (!isAuth || !userId || !canAccess) return

    const handler = () => {
      mutate().catch(() => {})
    }

    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [isAuth, userId, canAccess, mutate])

  return {
    count: Array.isArray(data?.surveys)
      ? data.surveys.filter((survey: any) => !survey?.myResponse).length
      : 0,
    loading: status === 'loading' || (isAuth && canAccess && !data && !error),
    error,
  }
}
