'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

type SessionUser = { id?: string }

export function useMaintenanceAssignedCount() {
  const { data: session, status } = useSession()
  const userId = (session?.user as SessionUser | undefined)?.id
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (status === 'loading') return
    if (!userId) {
      setCount(0)
      setLoading(false)
      return
    }

    async function load() {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/maintenance/tickets?ticketType=maquinaria&status=assignat&assignedToId=${userId}`,
          { cache: 'no-store' }
        )
        if (!res.ok) throw new Error('Error carregant tickets')
        const data = await res.json()
        const tickets = Array.isArray(data?.tickets) ? data.tickets : []
        if (active) setCount(tickets.length)
      } catch {
        if (active) setCount(0)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [status, userId])

  return { count, loading }
}
