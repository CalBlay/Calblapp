// file: src/app/menu/incidents/components/IncidentsPageHeader.tsx
'use client'

import React from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { AlertTriangle } from 'lucide-react'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface Props {
  total: number
}

export default function IncidentsPageHeader({ total }: Props) {
  return (
    <>
      {/* Capçalera del mòdul */}
      <ModuleHeader
        icon={<AlertTriangle className="w-7 h-7 text-yellow-600" />}
        title="Incidències"
        subtitle="Tauler de treball setmanal"
      />

      {/* Capçalera número total */}
      <div className={cn('mt-1 mb-3', typography('bodyMd'))}>
        Total incidències: <span className="font-semibold">{total}</span>
      </div>
    </>
  )
}
