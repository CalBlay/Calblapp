'use client'

import MaintenanceKpiCard from '@/app/menu/manteniment/components/MaintenanceKpiCard'
import { typography } from '@/lib/typography'
import type { TabKey } from '../types'
import type { MaintenanceStatus } from '../types'
import { STATUS_LABELS, formatTrackedHours } from '../utils'

type Props = {
  pendingValidationCount: number
  averageDays: number
  tab: TabKey
  externalizedCount: number
  totalPlannedMinutes: number
  totalTrackedMinutes: number
  summaryStatuses: MaintenanceStatus[]
  statusCounts: Record<MaintenanceStatus, number>
}

export default function SeguimentKpiGrid({
  pendingValidationCount,
  averageDays,
  tab,
  externalizedCount,
  totalPlannedMinutes,
  totalTrackedMinutes,
  summaryStatuses,
  statusCounts,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <MaintenanceKpiCard
        title="Pendents de validar"
        value={pendingValidationCount}
        note="Tasques en estat fet"
        className="border-amber-200 bg-amber-50/70"
      />

      <MaintenanceKpiCard
        title="Dies oberts mig"
        value={averageDays}
        note="Velocitat d'execucio"
        className="border-slate-200 bg-white"
      />

      <MaintenanceKpiCard
        title="Externalitzats"
        value={tab === 'tickets' ? externalizedCount : 0}
        note="Nomes tickets"
        className="border-violet-200 bg-violet-50/70"
      />

      <MaintenanceKpiCard
        title="Hores planificades"
        value={formatTrackedHours(totalPlannedMinutes)}
        className="border-slate-200 bg-white"
      />

      <MaintenanceKpiCard
        title="Hores reals"
        value={formatTrackedHours(totalTrackedMinutes)}
        className="border-slate-200 bg-white"
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-2.5">
        <div className="grid h-full w-full grid-cols-3 gap-1">
          {summaryStatuses.map((status) => (
            <div
              key={status}
              className="flex min-h-[40px] flex-col items-center justify-center rounded-lg bg-slate-50 px-1.5 py-1 text-center"
            >
              <div className={typography('eyebrow')}>{STATUS_LABELS[status]}</div>
              <div className="mt-1 text-sm font-semibold leading-none text-slate-900">
                {statusCounts[status]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
