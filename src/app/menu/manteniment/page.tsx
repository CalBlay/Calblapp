'use client'

import Link from 'next/link'
import {
  Wrench,
  Eye,
  CalendarCheck2,
  ClipboardList,
  Database,
  BarChart3,
} from 'lucide-react'
import { MAINTENANCE_TICKETS_INBOX_PERM } from '@/lib/maintenanceTicketsPermissions'
import ModuleHeader from '@/components/layout/ModuleHeader'
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

  return (
    <MaintenancePermissionGate path="/menu/manteniment">
      <div className="w-full max-w-6xl mx-auto p-4 space-y-5">
        <ModuleHeader
          title="Manteniment"
          subtitle="Gestió i assignació"
          actions={canManageTicketInbox || canViewTickets ? <MaintenanceNotificationsBell /> : undefined}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {canViewTickets && (
            <Link
              href="/menu/manteniment/tickets"
              className="border rounded-2xl p-5 hover:shadow-sm bg-gradient-to-br from-amber-50 to-yellow-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-amber-700">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Tickets</div>
                  <div className="text-xs text-gray-500">Entrada i gestio</div>
                </div>
              </div>
            </Link>
          )}

          {canViewPlanner && (
            <Link
              href="/menu/manteniment/preventius/planificador"
              className="border rounded-2xl p-5 hover:shadow-sm bg-gradient-to-br from-teal-50 to-cyan-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-teal-700">
                  <CalendarCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Planificador</div>
                  <div className="text-xs text-gray-500">
                    {canViewTickets ? 'Preventius + tickets' : 'Preventius'}
                  </div>
                </div>
              </div>
            </Link>
          )}

          {canViewData && (
            <Link
              href="/menu/manteniment/dades"
              className="border rounded-2xl p-5 hover:shadow-sm bg-gradient-to-br from-sky-50 to-blue-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-sky-700">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Dades</div>
                  <div className="text-xs text-gray-500">Maquinaria i proveidors</div>
                </div>
              </div>
            </Link>
          )}

          {canViewJourney && (
            <Link
              href="/menu/manteniment/preventius/fulls"
              className="border rounded-2xl p-5 hover:shadow-sm bg-gradient-to-br from-emerald-50 to-green-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-emerald-600">
                  <div className="relative">
                    <Wrench className="w-5 h-5" />
                    {assignedTicketsCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {assignedTicketsCount}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Jornada</div>
                  <div className="text-xs text-gray-500">
                    {canViewTickets ? 'Preventius + tickets' : 'Preventius'}
                  </div>
                </div>
              </div>
            </Link>
          )}

          {canViewSeguiment && (
            <Link
              href="/menu/manteniment/seguiment"
              className="border rounded-2xl p-5 hover:shadow-sm bg-gradient-to-br from-indigo-50 to-purple-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Seguiment</div>
                  <div className="text-xs text-gray-500">Consulta d'estat</div>
                </div>
              </div>
            </Link>
          )}

          {canViewReports && (
            <Link
              href="/menu/manteniment/informes"
              className="border rounded-2xl p-5 hover:shadow-sm bg-gradient-to-br from-violet-50 to-fuchsia-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-violet-600">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Informes</div>
                  <div className="text-xs text-gray-500">KPIs i informes a mida</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </MaintenancePermissionGate>
  )
}
