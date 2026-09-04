'use client'

import LogisticsPage from '@/app/menu/logistica/preparacio/page'
import MaintenancePermissionGate from '@/app/menu/manteniment/components/MaintenancePermissionGate'

export default function DecoPreparationPage() {
  return (
    <MaintenancePermissionGate path="/menu/deco/preparacio">
      <LogisticsPage />
    </MaintenancePermissionGate>
  )
}
