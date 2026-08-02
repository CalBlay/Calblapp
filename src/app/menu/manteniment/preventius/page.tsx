'use client'

import Link from 'next/link'
import { CalendarRange, ListChecks } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'

export default function PreventiusIndexPage() {
  const { canViewPath } = useUiPermissions()
  const canViewPlanner = canViewPath('/menu/manteniment/preventius/planificador')
  const canViewJourney = canViewPath('/menu/manteniment/preventius/fulls')

  return (
    <MaintenancePermissionGate path="/menu/manteniment/preventius">
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4">
        <ModuleHeader subtitle="Preventius i neteges (nou)" />

        <div className="max-w-4xl rounded-2xl border bg-white p-5 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">Com funciona</div>
          <div className="mt-1">
            {'Dades > Preventius -> ordres generades -> planificacio setmanal (cap) -> full diari (operari) -> historial i tracabilitat.'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {canViewPlanner && (
            <Link
              href="/menu/manteniment/preventius/planificador"
              className="rounded-2xl border bg-gradient-to-br from-teal-50 to-cyan-100 p-5 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-teal-700 shadow">
                  <CalendarRange className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Planificador</div>
                  <div className="text-xs text-gray-500">Setmana (dl-dv)</div>
                </div>
              </div>
            </Link>
          )}

          {canViewJourney && (
            <Link
              href="/menu/manteniment/preventius/fulls"
              className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-green-100 p-5 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-700 shadow">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Full diari</div>
                  <div className="text-xs text-gray-500">La meva jornada</div>
                </div>
              </div>
            </Link>
          )}

        </div>
      </div>
    </MaintenancePermissionGate>
  )
}
