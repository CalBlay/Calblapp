'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { normalizeRole } from '@/lib/roles'

export default function SettingsAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const role = normalizeRole(session?.user?.role || '')

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user) {
      router.replace('/login')
      return
    }
    if (role !== 'admin') {
      router.replace('/menu')
    }
  }, [status, session?.user, role, router])

  if (status === 'loading') return <p className="p-4">Carregant...</p>
  if (!session?.user) return <p className="p-4">No autoritzat.</p>
  if (role !== 'admin') return null

  return (
    <section className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Settings (Admin)</h1>
      <p className="text-sm text-muted-foreground">
        Administració del sistema. Només visible per Admin.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/menu/settings/permisos"
          className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition"
        >
          <div className="font-semibold">Permisos</div>
          <div className="text-sm text-muted-foreground">
            Rols i overrides per usuari.
          </div>
        </Link>
      </div>
    </section>
  )
}

