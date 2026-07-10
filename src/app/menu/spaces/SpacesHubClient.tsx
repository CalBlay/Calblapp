'use client'

import { useMemo } from 'react'
import { CalendarDays, Map } from 'lucide-react'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  SPACES_BBDD_PATH,
  SPACES_RESERVES_PATH,
} from '@/lib/spacesPermissions'

export default function SpacesHubClient() {
  const { ready, canViewPath } = useUiPermissions()

  const cards = useMemo<ModuleHubCard[]>(() => {
    const items: ModuleHubCard[] = []

    if (!ready || canViewPath(SPACES_RESERVES_PATH)) {
      items.push({
        href: SPACES_RESERVES_PATH,
        title: 'Consultar reserves',
        description: 'Agenda i consulta de reserves',
        icon: CalendarDays,
        tone: 'blue',
      })
    }

    if (!ready || canViewPath(SPACES_BBDD_PATH)) {
      items.push({
        href: SPACES_BBDD_PATH,
        title: 'Consultar espais',
        description: "Base de dades d'espais",
        icon: Map,
        tone: 'emerald',
      })
    }

    return items
  }, [ready, canViewPath])

  return (
    <ModuleHub
      cards={cards}
      emptyMessage="No tens accés a cap secció d'Espais."
      gridClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
    />
  )
}
