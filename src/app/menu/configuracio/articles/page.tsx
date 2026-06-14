'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyArticlesRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/menu/settings/articles')
  }, [router])

  return <p className="p-4 text-sm text-slate-500">Redirigint…</p>
}
