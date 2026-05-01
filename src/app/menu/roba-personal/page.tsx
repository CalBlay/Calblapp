'use client'

import React from 'react'
import { Shirt } from 'lucide-react'
import { withAdmin } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import RobaPersonalDashboard from './RobaPersonalDashboard'

function RobaPersonalPage() {
  return (
    <div className="w-full flex flex-col gap-6 sm:gap-8">
      <ModuleHeader
        title="Roba personal"
        subtitle="Gestió de productes, treballadors, estoc, sol·licituds, entregues i correu a compres."
        icon={<Shirt className="h-8 w-8 text-indigo-600" />}
        mainHref="/menu/roba-personal"
      />
      <RobaPersonalDashboard />
    </div>
  )
}

export default withAdmin(RobaPersonalPage)
