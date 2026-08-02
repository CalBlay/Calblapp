'use client'

import ModuleHeader from '@/components/layout/ModuleHeader'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'

export default function MaintenanceWorkPage() {
  return (
    <MaintenancePermissionGate>
      <div className="space-y-5 px-4 pb-8">
        <ModuleHeader title="Deco" subtitle="Fulls legacy" mainHref="/menu/deco" />
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          La vista de treball de decoracio ha quedat retirada del flux actiu. Es conserva nomes
          com a ruta legacy mentre es simplifica l'arquitectura del sistema de tickets.
        </div>
      </div>
    </MaintenancePermissionGate>
  )
}
