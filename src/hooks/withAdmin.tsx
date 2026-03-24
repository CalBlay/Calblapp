// File: src/hooks/withAdmin.tsx
'use client'

import React, { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'

export function withAdmin<P extends object>(Component: React.ComponentType<P>) {
  const Wrapped: React.FC<P> = (props: P) => {
    const { data: session, status } = useSession()
    const router = useRouter()
    const pathname = usePathname()
    const redirectedRef = useRef(false)

    // 1) Estats de càrrega
    const isLoading = status === 'loading'
    const roleNorm = normalizeRole(session?.user?.role as string | undefined)

    // 2) Bloqueig d’accés (només 'admin')
    useEffect(() => {
      if (isLoading) return
      if (roleNorm !== 'admin' && !redirectedRef.current) {
        redirectedRef.current = true
        // Opcional: enviem on veníem per poder tornar després del login
        const redirectTo = encodeURIComponent(pathname || '/')
        router.replace(`/login?redirectTo=${redirectTo}`)
      }
    }, [isLoading, roleNorm, router, pathname])

    if (isLoading) {
      return <div className="p-4">Comprovant sessió…</div>
    }

    if (roleNorm !== 'admin') {
      return <div className="p-4">Comprovant privilegis…</div>
    }

    return <Component {...props} />
  }

  Wrapped.displayName = `withAdmin(${Component.displayName || Component.name || 'Component'})`
  return Wrapped
}
