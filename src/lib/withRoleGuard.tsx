// file: src/lib/withRoleGuard.tsx
'use client'

import * as React from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'
import { getVisibleModules } from '@/lib/accessControl'
import { isUiPathAllowed } from '@/lib/uiPathAccess'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface SessionUser {
  id: string
  name?: string | null
  email?: string | null
  role?: string
  department?: string | null
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean
}

interface RoleGuardProps {
  allowedRoles: string[]
  children: React.ReactNode
}

/**
 * Protecció d'accés per rols i permisos UI (Settings → permisos).
 * Quan els permisos UI estan carregats, són l'autoritat per a rutes /menu/*.
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const user = session?.user as SessionUser | undefined
  const { data: uiPermData } = useSWR(user?.id ? '/api/permissions/ui' : null, fetcher)
  const uiMap = React.useMemo(
    () => (uiPermData?.map || {}) as Record<string, boolean>,
    [uiPermData?.map]
  )

  const normalizedAllowed = React.useMemo(
    () => allowedRoles.map((r) => normalizeRole(r)),
    [allowedRoles]
  )

  const isMenuRoute = Boolean(pathname?.startsWith('/menu/'))
  const awaitingUiPermissions = isMenuRoute && Boolean(user?.id) && !uiPermData && status !== 'loading'

  React.useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.replace('/menu')
      return
    }

    if (uiPermData && isMenuRoute) {
      if (!isUiPathAllowed(pathname || '', uiMap)) {
        router.replace('/menu')
      }
      return
    }

    const role = normalizeRole(user?.role || '')
    const visibleModules = getVisibleModules({
      role,
      department: user?.department || undefined,
      canRespondSurveys: user?.canRespondSurveys,
      isDepartmentRobaLead: user?.isDepartmentRobaLead,
      robaLinkedPersonnelId: user?.robaLinkedPersonnelId,
      opsProjectsConfigurable: user?.opsProjectsConfigurable,
    })
    const hasModuleAccess = pathname
      ? visibleModules.some((mod) => {
          if (pathname === mod.path) return true
          if (mod.submodules?.length) {
            return mod.submodules.some((sub) => pathname.startsWith(sub.path))
          }
          return pathname.startsWith(mod.path)
        })
      : false

    if (!normalizedAllowed.includes(role) && !hasModuleAccess) {
      router.replace('/menu')
    }
  }, [
    status,
    session,
    user,
    router,
    normalizedAllowed,
    pathname,
    uiPermData,
    uiMap,
    isMenuRoute,
  ])

  if (status === 'loading' || awaitingUiPermissions) {
    return <p>Carregant…</p>
  }

  return <>{children}</>
}
