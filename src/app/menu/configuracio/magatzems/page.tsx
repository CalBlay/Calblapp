'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyMagatzemsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/menu/settings/magatzems')
  }, [router])

  return <p className="p-4 text-sm text-slate-500">Redirigint…</p>
}
