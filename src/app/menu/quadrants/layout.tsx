// src/app/menu/quadrants/layout.tsx
'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import { useUiPermissions } from '@/hooks/useUiPermissions'

export default function QuadrantsLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const { ready, canViewPath } = useUiPermissions()

  if (status === 'loading') return <div className="p-4">Carregant sessió…</div>
  if (!session?.user) return <div className="p-4">No autoritzat.</div>

  if (!ready) return <div className="p-4">Carregant permisos…</div>
  if (!canViewPath('/menu/quadrants')) {
    return <div className="p-4">No tens permisos per veure Quadrants.</div>
  }

  return <>{children}</>
}
