'use client'

import Link from 'next/link'
import { CalendarRange, FileStack, ListChecks } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { normalizeRole } from '@/lib/roles'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export default function PreventiusIndexPage() {
  const { data: session } = useSession()
  const userRole = normalizeRole((session?.user as any)?.role || '')
  const userDepartment = normalizeDept((session?.user as any)?.department || '')

  const isMaintenanceWorker = userRole === 'treballador' && userDepartment === 'manteniment'
  const isMaintenanceCap = userRole === 'cap' && isMaintenanceCapDepartment(userDepartment)
  const isAdmin = userRole === 'admin' || userRole === 'direccio'

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
        <ModuleHeader subtitle="Preventius i neteges (nou)" />

        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">Com funciona</div>
          <div className="mt-1">
            Plantilles → ordres generades → planificació setmanal (cap) → full diari (operari) →
            historial i traçabilitat.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(isAdmin || isMaintenanceCap) && (
            <Link
              href="/menu/manteniment/preventius/planificador"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-teal-50 to-cyan-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-teal-700">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Planificador</div>
                  <div className="text-xs text-gray-500">Setmana (dl–dv)</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap || isMaintenanceWorker) && (
            <Link
              href="/menu/manteniment/preventius/fulls"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-emerald-50 to-green-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-emerald-700">
                  <ListChecks className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Full diari</div>
                  <div className="text-xs text-gray-500">La meva jornada</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap) && (
            <Link
              href="/menu/manteniment/preventius/plantilles"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-slate-50 to-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-slate-700">
                  <FileStack className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Plantilles</div>
                  <div className="text-xs text-gray-500">Plans i checklists</div>
                </div>
              </div>
            </Link>
          )}

        </div>
      </div>
    </RoleGuard>
  )
}
