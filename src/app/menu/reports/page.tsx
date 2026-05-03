'use client'

import { InformesModule } from '@/components/informes/InformesModule'
import {
  ModuleExportMenuProvider,
} from '@/components/export/ModuleExportMenuContext'

export default function ReportsPage() {
  return (
    <ModuleExportMenuProvider>
      <InformesModule />
    </ModuleExportMenuProvider>
  )
}
