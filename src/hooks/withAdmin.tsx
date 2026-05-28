// File: src/hooks/withAdmin.tsx
'use client'

import React, { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { normalizeRole, type Role } from '@/lib/roles'

/** Rols amb accés al mòdul Documentació (mateix conjunt que `accessControl`). */
export const DOCUMENTACIO_PAGE_ROLES: readonly Role[] = ['admin', 'direccio']

export function withRoles<P extends object>(
  allowedRoles: readonly Role[],
  Component: React.ComponentType<P>
) {
  const allowed = new Set<Role>(allowedRoles)
  const Wrapped: React.FC<P> = (props: P) => {
    const { data: session, status } = useSession()
    const router = useRouter()
    const pathname = usePathname()
    const redirectedRef = useRef(false)

    const isLoading = status === 'loading'
    const roleNorm = normalizeRole(session?.user?.role as string | undefined)
    const ok = allowed.has(roleNorm)

    useEffect(() => {
      if (isLoading) return
      if (!ok && !redirectedRef.current) {
        redirectedRef.current = true
        const redirectTo = encodeURIComponent(pathname || '/')
        router.replace(`/login?redirectTo=${redirectTo}`)
      }
    }, [isLoading, ok, router, pathname])

    if (isLoading) {
      return <div className="p-4">Comprovant sessió…</div>
    }

    if (!ok) {
      return <div className="p-4">Comprovant privilegis…</div>
    }

    return <Component {...props} />
  }

  Wrapped.displayName = `withRoles(${Component.displayName || Component.name || 'Component'})`
  return Wrapped
}

/** Departament normalitzat (mateix criteri que `normDeptLabel` al servidor). */
function sessionDepartmentNorm(raw?: string | null): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Accés a `/menu/roba-personal`: administradors, RRHH, responsable de roba de departament o treballador amb usuari vinculat a `personnel`.
 */
export function withRobaPersonalAccess<P extends object>(Component: React.ComponentType<P>) {
  const RRHH = 'recursos humans'
  const Wrapped: React.FC<P> = (props: P) => {
    const { data: session, status } = useSession()
    const router = useRouter()
    const pathname = usePathname()
    const redirectedRef = useRef(false)

    const isLoading = status === 'loading'
    const roleNorm = normalizeRole(session?.user?.role as string | undefined)
    const deptNorm = sessionDepartmentNorm(
      (session?.user as { department?: string } | undefined)?.department
    )
    const isDeptRobaLead = Boolean(
      (session?.user as { isDepartmentRobaLead?: boolean } | undefined)?.isDepartmentRobaLead
    )
    const robaLinked = Boolean(
      String(
        (session?.user as { robaLinkedPersonnelId?: string | null } | undefined)
          ?.robaLinkedPersonnelId || ''
      ).trim()
    )
    const legacyOk = roleNorm === 'admin' || deptNorm === RRHH || isDeptRobaLead || robaLinked
    const { uiMap, ready: permsReady } = useUiPermissions()
    const ok = permsReady ? uiMap['/menu/roba-personal'] === true : legacyOk

    useEffect(() => {
      if (isLoading) return
      if (!ok && !redirectedRef.current) {
        redirectedRef.current = true
        const redirectTo = encodeURIComponent(pathname || '/')
        router.replace(`/login?redirectTo=${redirectTo}`)
      }
    }, [isLoading, ok, router, pathname])

    if (isLoading) {
      return <div className="p-4">Comprovant sessió…</div>
    }

    if (!ok) {
      return <div className="p-4">Comprovant privilegis…</div>
    }

    return <Component {...props} />
  }

  Wrapped.displayName = `withRobaPersonalAccess(${Component.displayName || Component.name || 'Component'})`
  return Wrapped
}

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
