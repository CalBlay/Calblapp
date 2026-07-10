'use client'

import { ClipboardList, Search } from 'lucide-react'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import { MODULES } from '@/lib/accessControl'
import { useMemo } from 'react'
import { useUiPermissions } from '@/hooks/useUiPermissions'

export default function AllergensHubPage() {
  const { map: uiMap, data: uiPermData } = useUiPermissions()

  const allergensModule = MODULES.find((m) => m.path === '/menu/allergens')
  const allowedSubmodules = useMemo(() => {
    const allSubmodules = allergensModule?.submodules ?? []
    if (!uiPermData) return allSubmodules
    return allSubmodules.filter((s) => uiMap[s.path] !== false)
  }, [allergensModule, uiPermData, uiMap])

  const cards: ModuleHubCard[] = allowedSubmodules.map((sub) => {
    const key = sub.path.split('/').pop() || sub.path

    if (key === 'bbdd') {
      return {
        href: sub.path,
        title: sub.label,
        description: "Base de dades d'al·lèrgens",
        icon: ClipboardList,
        tone: 'amber',
      }
    }

    if (key === 'buscador') {
      return {
        href: sub.path,
        title: sub.label,
        description: 'Consulta ràpida de plats',
        icon: Search,
        tone: 'orange',
      }
    }

    return {
      href: sub.path,
      title: sub.label,
      icon: ClipboardList,
      tone: 'slate',
    }
  })

  return <ModuleHub cards={cards} emptyMessage="No tens accés a cap secció d'Al·lèrgens." />
}
