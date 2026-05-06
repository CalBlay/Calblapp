'use client'

import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { normalizeRole } from '@/lib/roles'
import { useEffect } from 'react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SessionUserExtras = {
  id?: string
  role?: string
  canRespondSurveys?: boolean
}

export function useSurveyNotificationCount() {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const u = session?.user as SessionUserExtras | undefined
  const userId = String(u?.id || '').trim()
  const role = normalizeRole(String(u?.role || ''))
  const canRespondSurveys = Boolean(u?.canRespondSurveys)
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
      ? data.surveys.filter((survey: { myResponse?: unknown }) => !survey?.myResponse).length
      : 0,
    loading: status === 'loading' || (isAuth && canAccess && !data && !error),
    error,
  }
}
