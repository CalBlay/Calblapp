'use client'

import { BarChart3 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import {
  ModuleExportMenuActions,
  ModuleExportMenuProvider,
} from '@/components/export/ModuleExportMenuContext'
import { MaintenanceInformesPanel } from '@/components/informes/domains/MaintenanceInformesPanel'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'

export default function MaintenanceReportsPage() {
  return (
    <MaintenancePermissionGate path="/menu/manteniment/informes">
      <ModuleExportMenuProvider>
        <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 pb-8 pt-4 sm:gap-6 lg:px-6 xl:px-8">
          <ModuleHeader
            icon={<BarChart3 className="h-7 w-7 text-indigo-600" />}
            title="Informes"
            subtitle="Anàlisi de manteniment amb els mateixos KPIs i informes a mida del mòdul Informes."
            actions={<ModuleExportMenuActions />}
          />

          <MaintenanceInformesPanel />
        </div>
      </ModuleExportMenuProvider>
    </MaintenancePermissionGate>
  )
}
