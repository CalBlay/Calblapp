// file: src/lib/withRoleGuard.tsx
'use client'

import * as React from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'
import { getVisibleModules } from '@/lib/accessControl'

interface SessionUser {
  id: string
  name?: string | null
  email?: string | null
  role?: string
  department?: string | null
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

  // Normalitzem la llista per si arriba algun rol amb majÇ§scules o accents
  const normalizedAllowed = React.useMemo(
    () => allowedRoles.map((r) => normalizeRole(r)),
    [allowedRoles]
  )

  React.useEffect(() => {
    if (status === 'loading') return

    const user = session?.user as SessionUser | undefined
    const role = normalizeRole(user?.role || '')

    // Si el mÇ?dul actual ja surt com a visible, deixem passar encara que hi hagi desajust als allowedRoles
    const visibleModules = getVisibleModules({
      role,
      department: user?.department || undefined,
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

    if (!session || (!normalizedAllowed.includes(role) && !hasModuleAccess)) {
      router.replace('/menu')
      return
    }
  }, [status, session, router, normalizedAllowed, pathname])

  if (status === 'loading') return <p>Carregantƒ?Ý</p>

  return <>{children}</>
}
