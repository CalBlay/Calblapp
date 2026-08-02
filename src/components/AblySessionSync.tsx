'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { resetAblyClient } from '@/lib/ablyClient'

/** Reinicia Ably quan canvia l'usuari o es tanca sessió (evita tokens d'un altre compte). */
export default function AblySessionSync() {
  const { data: session, status } = useSession()
  const userId = String(session?.user?.id || '').trim() || null
  const previousUserId = useRef<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      previousUserId.current = null
      resetAblyClient()
      return
    }

    if (status !== 'authenticated') return

    if (previousUserId.current && userId && previousUserId.current !== userId) {
      resetAblyClient()
    }

    previousUserId.current = userId
  }, [status, userId])

  return null
}
