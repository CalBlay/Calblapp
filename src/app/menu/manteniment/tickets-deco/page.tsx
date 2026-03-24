'use client'

import { RoleGuard } from '@/lib/withRoleGuard'
import ModuleHeader from '@/components/layout/ModuleHeader'

export default function MaintenanceTicketsDecoPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="space-y-5 px-4 pb-8">
        <ModuleHeader title="Deco" subtitle="Tickets legacy" mainHref="/menu/deco" />
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Aquesta pantalla ha quedat fora del flux operatiu. Els tickets deco s'han desconnectat
          del frontend actiu per reduir complexitat i consolidar el modul principal de manteniment.
        </div>
      </div>
    </RoleGuard>
  )
}
