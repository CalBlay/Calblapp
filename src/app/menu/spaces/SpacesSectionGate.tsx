'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useUiPermissions } from '@/hooks/useUiPermissions'

type Props = {
  subpath: string
  children: React.ReactNode
  redirectTo?: string
}

export default function SpacesSectionGate({
  subpath,
  children,
  redirectTo = '/menu/spaces',
}: Props) {
  const router = useRouter()
  const { ready, canViewPath } = useUiPermissions()

  const allowed = useMemo(() => {
    if (!ready) return null
    return canViewPath(subpath)
  }, [ready, canViewPath, subpath])

  useEffect(() => {
    if (allowed === false) router.replace(redirectTo)
  }, [allowed, router, redirectTo])

  if (allowed === null) {
    return <div className="p-6 text-sm text-gray-500">Carregant permisos…</div>
  }

  if (!allowed) return null

  return <>{children}</>
}
