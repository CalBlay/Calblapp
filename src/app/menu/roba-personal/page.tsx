'use client'

import React from 'react'
import { Shirt } from 'lucide-react'
import { withRobaPersonalAccess } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import RobaPersonalDashboard from './RobaPersonalDashboard'
import { RobaPersonalRequestNotificationsBell } from './RobaPersonalRequestNotificationsBell'
import {
  ModuleExportMenuActions,
  ModuleExportMenuProvider,
} from '@/components/export/ModuleExportMenuContext'

function RobaPersonalPage() {
  return (
    <ModuleExportMenuProvider>
      <div className="w-full flex flex-col gap-6 sm:gap-8">
        <ModuleHeader
          title="Roba personal / Gestió de productes"
          icon={<Shirt className="h-8 w-8 text-indigo-600" />}
          mainHref="/menu/roba-personal"
          actions={
            <>
              <RobaPersonalRequestNotificationsBell />
              <ModuleExportMenuActions />
            </>
          }
        />
        <RobaPersonalDashboard />
      </div>
    </ModuleExportMenuProvider>
  )
}

export default withRobaPersonalAccess(RobaPersonalPage)
