'use client'

import {
  Wrench,
  Eye,
  CalendarCheck2,
  ClipboardList,
  Database,
  BarChart3,
} from 'lucide-react'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import { MAINTENANCE_TICKETS_INBOX_PERM } from '@/lib/maintenanceTicketsPermissions'
import MaintenanceNotificationsBell from './components/MaintenanceNotificationsBell'
import MaintenancePermissionGate from './components/MaintenancePermissionGate'
import { useMaintenanceAssignedCount } from '@/hooks/useMaintenanceAssignedCount'
import { useUiPermissions } from '@/hooks/useUiPermissions'

export default function MantenimentIndexPage() {
  const { canViewPath, hasAction } = useUiPermissions()
  const canViewTickets = canViewPath('/menu/manteniment/tickets')
  const canViewPlanner = canViewPath('/menu/manteniment/preventius')
  const canViewJourney = canViewPath('/menu/manteniment/preventius/fulls')
  const canViewData = canViewPath('/menu/manteniment/dades')
  const canViewSeguiment = canViewPath('/menu/manteniment/seguiment')
  const canViewReports = canViewPath('/menu/manteniment/informes')
  const canManageTicketInbox = hasAction(MAINTENANCE_TICKETS_INBOX_PERM)
  const { count: assignedTicketsCount } = useMaintenanceAssignedCount()

  const cards: ModuleHubCard[] = []

  if (canViewTickets) {
    cards.push({
      href: '/menu/manteniment/tickets',
      title: 'Tickets',
      description: 'Entrada i gestio',
      icon: ClipboardList,
      tone: 'amber',
    })
  }

  if (canViewPlanner) {
    cards.push({
      href: '/menu/manteniment/preventius/planificador',
      title: 'Planificador',
      description: canViewTickets ? 'Preventius + tickets' : 'Preventius',
      icon: CalendarCheck2,
      tone: 'teal',
    })
  }

  if (canViewData) {
    cards.push({
      href: '/menu/manteniment/dades',
      title: 'Dades',
      description: 'Maquinaria i proveidors',
      icon: Database,
      tone: 'sky',
    })
  }

  if (canViewJourney) {
    cards.push({
      href: '/menu/manteniment/preventius/fulls',
      title: 'Jornada',
      description: canViewTickets ? 'Preventius + tickets' : 'Preventius',
      icon: Wrench,
      tone: 'emerald',
      badge:
        assignedTicketsCount > 0 ? (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {assignedTicketsCount}
          </span>
        ) : undefined,
    })
  }

  if (canViewSeguiment) {
    cards.push({
      href: '/menu/manteniment/seguiment',
      title: 'Seguiment',
      description: "Consulta d'estat",
      icon: Eye,
      tone: 'indigo',
    })
  }

  if (canViewReports) {
    cards.push({
      href: '/menu/manteniment/informes',
      title: 'Informes',
      description: 'KPIs i informes a mida',
      icon: BarChart3,
      tone: 'violet',
    })
  }

  return (
    <MaintenancePermissionGate path="/menu/manteniment">
      <ModuleHub
        title="Manteniment"
        subtitle="Gestió i assignació"
        actions={canManageTicketInbox || canViewTickets ? <MaintenanceNotificationsBell /> : undefined}
        cards={cards}
      />
    </MaintenancePermissionGate>
  )
}
