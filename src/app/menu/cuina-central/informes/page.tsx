'use client'

import { BarChart2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import {
  ModuleExportMenuActions,
  ModuleExportMenuProvider,
} from '@/components/export/ModuleExportMenuContext'
import { MaintenanceInformesPanel } from '@/components/informes/domains/MaintenanceInformesPanel'

export default function CuinaCentralInformesPage() {
  return (
    <ModuleExportMenuProvider>
      <div>
        <ModuleHeader
          title="Cuina central · Informes"
          subtitle="KPIs, filtres i detall dels tiquets de manteniment de Cuina Central."
          icon={<BarChart2 className="h-5 w-5 text-slate-700" aria-hidden />}
          actions={<ModuleExportMenuActions />}
        />

        <MaintenanceInformesPanel scope="cuina_central" />
      </div>
    </ModuleExportMenuProvider>
  )
}
