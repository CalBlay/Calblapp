'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUiPermissions } from '@/hooks/useUiPermissions'

export default function CuinaCentralIndexPage() {
  const router = useRouter()
  const { ready, isPathAllowed } = useUiPermissions()

  useEffect(() => {
    if (!ready) return
    if (isPathAllowed('/menu/cuina-central/dades')) {
      router.replace('/menu/cuina-central/dades')
      return
    }
    router.replace('/menu/cuina-central/manteniment')
  }, [isPathAllowed, ready, router])

  return <p className="text-sm text-slate-500">Carregant...</p>
}
