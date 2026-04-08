// src/app/providers.tsx
'use client'

import React from 'react'
import { SWRConfig } from 'swr'
import { SessionProvider } from 'next-auth/react'
import { defaultSwrConfig } from '@/lib/swr-fetcher'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig value={defaultSwrConfig}>{children}</SWRConfig>
    </SessionProvider>
  )
}
