'use client'

import PreventiusPlanificadorPage from '@/app/menu/manteniment/preventius/planificador/page'
import MaintenancePermissionGate from '@/app/menu/manteniment/components/MaintenancePermissionGate'

export default function DecoPlannerPage() {
  return (
    <MaintenancePermissionGate path="/menu/deco/planificador">
      <PreventiusPlanificadorPage />
    </MaintenancePermissionGate>
  )
}
