'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUiPermissions } from '@/hooks/useUiPermissions'

type MaintenancePermissionGateProps = {
  children: React.ReactNode
  path?: string
}

export default function MaintenancePermissionGate({
  children,
  path,
}: MaintenancePermissionGateProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { ready, isPathAllowed } = useUiPermissions()

  const targetPath = path || pathname || '/menu/manteniment'
  const allowed = ready ? isPathAllowed(targetPath) : false

  useEffect(() => {
    if (!ready) return
    if (!allowed) router.replace('/menu')
  }, [allowed, ready, router])

  if (!ready) return <p>Carregant...</p>
  if (!allowed) return null

  return <>{children}</>
}
