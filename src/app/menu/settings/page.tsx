'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ClipboardList, ConciergeBell, Package, Shield } from 'lucide-react'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
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

  const cards: ModuleHubCard[] = []

  if (isAdmin) {
    cards.push({
      href: '/menu/settings/permisos',
      title: 'Permisos',
      description: 'Rols i overrides per usuari.',
      icon: Shield,
      tone: 'slate',
    })
  }

  if (canViewMagatzems) {
    cards.push({
      href: '/menu/settings/magatzems',
      title: 'Magatzems',
      description: 'Codis i noms de magatzem per a les comandes ERP.',
      icon: Package,
      tone: 'emerald',
    })
  }

  if (canViewArticles) {
    cards.push({
      href: '/menu/settings/articles',
      title: 'Articles',
      description: "Regles de prefix i catàleg d'articles de comanda.",
      icon: ClipboardList,
      tone: 'teal',
    })
  }

  if (canViewServeis) {
    cards.push({
      href: '/menu/settings/serveis',
      title: 'Serveis',
      description: 'Catàleg de serveis per a esdeveniments i cerques.',
      icon: ConciergeBell,
      tone: 'sky',
    })
  }

  return (
    <ModuleHub
      title="Settings"
      subtitle="Administració del sistema i configuració de comandes d'esdeveniments."
      cards={cards}
      emptyMessage="No tens accés a cap secció de Settings."
      gridClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
    />
  )
}
