'use client'

import Link from 'next/link'
import {
  Wrench,
  Eye,
  CalendarCheck2,
  ClipboardList,
  Database,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { RoleGuard } from '@/lib/withRoleGuard'
import { normalizeRole } from '@/lib/roles'
import {
  isMaintenanceCapDepartment,
  canManageMaintenanceTickets,
} from '@/lib/accessControl'
import { MAINTENANCE_TICKETS_INBOX_PERM } from '@/lib/maintenanceTicketsPermissions'
import ModuleHeader from '@/components/layout/ModuleHeader'
import MaintenanceNotificationsBell from './components/MaintenanceNotificationsBell'
import { useMaintenanceAssignedCount } from '@/hooks/useMaintenanceAssignedCount'
import { useUiPermissions } from '@/hooks/useUiPermissions'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

type SessionUser = {
  id?: string
  role?: string
  department?: string
}

export default function MantenimentIndexPage() {
  const { data: session } = useSession()
  const sessionUser = session?.user as SessionUser | undefined
  const userRole = normalizeRole(sessionUser?.role || '')
  const userDepartment = normalizeDept(sessionUser?.department || '')
  const isMaintenanceWorker = userRole === 'treballador' && userDepartment === 'manteniment'
  const isMaintenanceCap = userRole === 'cap' && isMaintenanceCapDepartment(userDepartment)
  const isAdmin = userRole === 'admin' || userRole === 'direccio'
  const isProductionWorker = userRole === 'treballador' && userDepartment === 'produccio'
  const isCommercial = userRole === 'comercial'
  const { canViewPath, hasAction } = useUiPermissions()
  const canViewTickets = canViewPath('/menu/manteniment/tickets')
  const canManageTicketInbox = hasAction(MAINTENANCE_TICKETS_INBOX_PERM)
  const { count: assignedTicketsCount } = useMaintenanceAssignedCount()

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="w-full max-w-6xl mx-auto p-4 space-y-5">
        <ModuleHeader
          title="Manteniment"
          subtitle="Gestió i assignació"
          actions={<MaintenanceNotificationsBell />}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(isAdmin ||
            isMaintenanceCap ||
            canManageTicketInbox ||
            canManageMaintenanceTickets({ role: userRole, department: userDepartment }) ||
            canViewTickets) && (
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

          {(isAdmin || isMaintenanceCap) && (
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
                  <div className="text-xs text-gray-500">Preventius + tickets</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap) && (
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

          {(isMaintenanceWorker || isMaintenanceCap || isAdmin) && (
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
                  <div className="text-xs text-gray-500">Preventius + tickets</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap || isCommercial || isProductionWorker) && (
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
        </div>
      </div>
    </RoleGuard>
  )
}

