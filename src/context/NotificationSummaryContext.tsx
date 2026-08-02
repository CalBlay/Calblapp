'use client'

import React, { createContext, useContext, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import { normalizeRole } from '@/lib/roles'
import type { NotificationSummaryPayload } from '@/app/api/notifications/summary/route'

/** Fallback quan Ably no notifica (p.ex. desconnexió). */
export const NOTIFICATION_SUMMARY_FALLBACK_POLL_MS = 90_000

const EMPTY_SUMMARY: NotificationSummaryPayload = {
  adminUserRequests: 0,
  userRequestResults: 0,
  torn: 0,
  projects: 0,
  logistics: 0,
  maintenance: 0,
  incidents: 0,
  events: 0,
  surveys: 0,
  robaPersonal: 0,
  messaging: 0,
  isAdmin: false,
  isRrhh: false,
}

type NotificationSummaryContextValue = {
  summary: NotificationSummaryPayload
  loading: boolean
  error: unknown
  refresh: () => Promise<NotificationSummaryPayload | undefined>
}

const NotificationSummaryContext = createContext<NotificationSummaryContextValue | null>(null)

export function NotificationSummaryProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const isAuth = status === 'authenticated'
  const userId = String((session?.user as { id?: string } | undefined)?.id || '').trim()
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role || '')
  const isAdmin = role === 'admin'

  const { data, error, mutate } = useSWR<NotificationSummaryPayload>(
    isAuth ? '/api/notifications/summary' : null,
    {
      refreshInterval: isAuth ? NOTIFICATION_SUMMARY_FALLBACK_POLL_MS : 0,
    }
  )

  useEffect(() => {
    if (!isAuth || !userId) return

    const refresh = () => {
      mutate().catch(() => {})
    }

    const cleanups = [
      subscribeToAblyEvent({
        channelName: `user:${userId}:notifications`,
        eventName: 'created',
        handler: refresh,
      }),
      subscribeToAblyEvent({
        channelName: `user:${userId}:inbox`,
        eventName: 'updated',
        handler: refresh,
      }),
    ]

    if (isAdmin) {
      cleanups.push(
        subscribeToAblyEvent({
          channelName: 'admin:user-requests',
          eventName: 'created',
          handler: refresh,
        })
      )
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [isAuth, userId, isAdmin, mutate])

  const value = useMemo<NotificationSummaryContextValue>(
    () => ({
      summary: data ?? EMPTY_SUMMARY,
      loading: status === 'loading' || (isAuth && !data && !error),
      error,
      refresh: mutate,
    }),
    [data, error, isAuth, mutate, status]
  )

  return (
    <NotificationSummaryContext.Provider value={value}>
      {children}
    </NotificationSummaryContext.Provider>
  )
}

export function useNotificationSummaryContext(): NotificationSummaryContextValue {
  const ctx = useContext(NotificationSummaryContext)
  if (!ctx) {
    throw new Error('useNotificationSummaryContext must be used within NotificationSummaryProvider')
  }
  return ctx
}
