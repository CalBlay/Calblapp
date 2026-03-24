'use client'

import { RoleGuard } from '@/lib/withRoleGuard'
import ModuleHeader from '@/components/layout/ModuleHeader'

export default function DecoIndexPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <ModuleHeader subtitle="Submodul desconnectat" />
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          El flux de tickets de decoracio ha quedat desconnectat completament del frontend actiu.
          Aquesta pantalla es manté només per compatibilitat temporal amb enllacos antics.
        </div>
      </div>
    </RoleGuard>
  )
}
