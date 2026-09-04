'use client'

import { CalendarCheck2, ClipboardList, PackageCheck, Palette } from 'lucide-react'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import MaintenancePermissionGate from '@/app/menu/manteniment/components/MaintenancePermissionGate'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import MaintenanceNotificationsBell from '@/app/menu/manteniment/components/MaintenanceNotificationsBell'

export default function DecoIndexPage() {
  const { canViewPath } = useUiPermissions()
  const cards: ModuleHubCard[] = []

  if (canViewPath('/menu/deco/tickets')) {
    cards.push({
      href: '/menu/deco/tickets',
      title: 'Tickets',
      description: 'Incidències 4XX i peticions dels centres',
      icon: ClipboardList,
      tone: 'violet',
    })
  }

  if (canViewPath('/menu/deco/preparacio')) {
    cards.push({
      href: '/menu/deco/preparacio',
      title: 'Preparació',
      description: 'Comandes assignades al magatzem Deco',
      icon: PackageCheck,
      tone: 'cyan',
    })
  }

  if (canViewPath('/menu/deco/planificador')) {
    cards.push({
      href: '/menu/deco/planificador',
      title: 'Planificador',
      description: 'Planificació i assignació dels tickets de Deco',
      icon: CalendarCheck2,
      tone: 'violet',
    })
  }

  return (
    <MaintenancePermissionGate path="/menu/deco">
      <ModuleHub
        title="Imatge-Deco"
        subtitle="Tickets, planificació i preparació"
        icon={<Palette className="h-7 w-7 text-rose-600" />}
        actions={
          canViewPath('/menu/deco/tickets') ? (
            <MaintenanceNotificationsBell module="deco" />
          ) : undefined
        }
        cards={cards}
      />
    </MaintenancePermissionGate>
  )
}
