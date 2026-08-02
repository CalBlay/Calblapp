// src/app/providers.tsx
'use client'

import React from 'react'
import { SWRConfig } from 'swr'
import { SessionProvider } from 'next-auth/react'
import { defaultSwrConfig } from '@/lib/swr-fetcher'
import AblySessionSync from '@/components/AblySessionSync'
import { NotificationSummaryProvider } from '@/context/NotificationSummaryContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AblySessionSync />
      <SWRConfig value={defaultSwrConfig}>
        <NotificationSummaryProvider>{children}</NotificationSummaryProvider>
      </SWRConfig>
    </SessionProvider>
  )
}
