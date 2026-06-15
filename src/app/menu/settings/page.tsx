'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ClipboardList, ConciergeBell, Package, Shield } from 'lucide-react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { normalizeRole } from '@/lib/roles'
import {
  SETTINGS_ARTICLES_PATH,
  SETTINGS_MAGATZEMS_PATH,
  SETTINGS_SERVEIS_PATH,
  SETTINGS_UI_PATH,
  canViewSettingsSubpath,
} from '@/lib/settingsPermissions'

export default function SettingsAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { ready: permsReady, canViewPath } = useUiPermissions()

  const role = normalizeRole(session?.user?.role || '')
  const isAdmin = role === 'admin'
  const canViewSettings = canViewSettingsSubpath(canViewPath, SETTINGS_UI_PATH)
  const canViewMagatzems = canViewSettingsSubpath(canViewPath, SETTINGS_MAGATZEMS_PATH)
  const canViewArticles = canViewSettingsSubpath(canViewPath, SETTINGS_ARTICLES_PATH)
  const canViewServeis = canViewSettingsSubpath(canViewPath, SETTINGS_SERVEIS_PATH)

  useEffect(() => {
    if (status === 'loading' || !permsReady) return
    if (!session?.user) {
      router.replace('/login')
      return
    }
    if (!canViewSettings) {
      router.replace('/menu')
    }
  }, [status, session?.user, canViewSettings, permsReady, router])

  if (status === 'loading' || !permsReady) return <p className="p-4">Carregant...</p>
  if (!session?.user) return <p className="p-4">No autoritzat.</p>
  if (!canViewSettings) return null

  return (
    <section className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Administració del sistema i configuració de comandes d&apos;esdeveniments.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isAdmin ? (
          <Link
            href="/menu/settings/permisos"
            className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Shield className="h-4 w-4 text-slate-700" />
              Permisos
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Rols i overrides per usuari.
            </div>
          </Link>
        ) : null}

        {canViewMagatzems ? (
          <Link
            href="/menu/settings/magatzems"
            className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 text-emerald-600" />
              Magatzems
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Codis i noms de magatzem per a les comandes ERP.
            </div>
          </Link>
        ) : null}

        {canViewArticles ? (
          <Link
            href="/menu/settings/articles"
            className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition"
          >
            <div className="flex items-center gap-2 font-semibold">
              <ClipboardList className="h-4 w-4 text-emerald-600" />
              Articles
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Regles de prefix i catàleg d&apos;articles de comanda.
            </div>
          </Link>
        ) : null}

        {canViewServeis ? (
          <Link
            href="/menu/settings/serveis"
            className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition"
          >
            <div className="flex items-center gap-2 font-semibold">
              <ConciergeBell className="h-4 w-4 text-emerald-600" />
              Serveis
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Catàleg de serveis per a esdeveniments i cerques.
            </div>
          </Link>
        ) : null}
      </div>
    </section>
  )
}
