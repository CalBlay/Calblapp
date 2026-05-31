// file: src/lib/withRoleGuard.tsx
'use client'

import * as React from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'
import { getVisibleModules } from '@/lib/accessControl'
import { isUiPathBlocked } from '@/lib/uiPathAccess'
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
 * ÐY"' Component de protecciÇü dƒ?TaccÇ¸s per rols i departaments
 * - Mostra ƒ?oCarregantƒ?Ýƒ?? mentre la sessiÇü sƒ?TestÇÿ carregant.
 * - Redirigeix a /menu si lƒ?Tusuari no tÇ¸ accÇ¸s.
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

  // Normalitzem la llista per si arriba algun rol amb majÇ§scules o accents
  const normalizedAllowed = React.useMemo(
    () => allowedRoles.map((r) => normalizeRole(r)),
    [allowedRoles]
  )

  React.useEffect(() => {
    if (status === 'loading') return

    const role = normalizeRole(user?.role || '')

    // Si el mÇ?dul actual ja surt com a visible, deixem passar encara que hi hagi desajust als allowedRoles
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

    // Overrides UI (per sobre del codi base)
    if (uiPermData) {
      if (pathname && isUiPathBlocked(pathname, uiMap)) {
        router.replace('/menu')
        return
      }
    }

    if (!session || (!normalizedAllowed.includes(role) && !hasModuleAccess)) {
      router.replace('/menu')
      return
    }
  }, [status, session, user, router, normalizedAllowed, pathname, uiPermData, uiMap])

  if (status === 'loading') return <p>Carregantƒ?Ý</p>

  return <>{children}</>
}
