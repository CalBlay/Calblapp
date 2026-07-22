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
  activeStatuses: MaintenanceStatus[]
  externalFilter: 'all' | 'internal' | 'external'
  pendingValidationOnly: boolean
  onToggleStatus: (status: MaintenanceStatus) => void
  onToggleExternal: () => void
  onTogglePendingValidation: () => void
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
  activeStatuses,
  externalFilter,
  pendingValidationOnly,
  onToggleStatus,
  onToggleExternal,
  onTogglePendingValidation,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <button type="button" onClick={onTogglePendingValidation} className="text-left">
        <MaintenanceKpiCard
          title="Pendents de validar"
          value={pendingValidationCount}
          note="Tasques en estat fet"
          className={`rounded-xl border-amber-200 px-3 py-2.5 transition ${
            pendingValidationOnly
              ? 'bg-amber-100 ring-2 ring-amber-400 ring-offset-1'
              : 'bg-amber-50/70 hover:bg-amber-50'
          }`}
        />
      </button>

      <MaintenanceKpiCard
        title="Dies oberts mig"
        value={averageDays}
        note="Velocitat d'execucio"
        className="rounded-xl border-slate-200 bg-white px-3 py-2.5"
      />

      <button
        type="button"
        onClick={onToggleExternal}
        disabled={tab !== 'tickets'}
        className="text-left disabled:cursor-default"
      >
        <MaintenanceKpiCard
          title="Externalitzats"
          value={tab === 'tickets' ? externalizedCount : 0}
          note="Nomes tickets"
          className={`rounded-xl border-violet-200 px-3 py-2.5 transition ${
            tab === 'tickets' && externalFilter === 'external'
              ? 'bg-violet-100 ring-2 ring-violet-400 ring-offset-1'
              : 'bg-violet-50/70 hover:bg-violet-50'
          }`}
        />
      </button>

      <MaintenanceKpiCard
        title="Hores planificades"
        value={formatTrackedHours(totalPlannedMinutes)}
        className="rounded-xl border-slate-200 bg-white px-3 py-2.5"
      />

      <MaintenanceKpiCard
        title="Hores reals"
        value={formatTrackedHours(totalTrackedMinutes)}
        className="rounded-xl border-slate-200 bg-white px-3 py-2.5"
      />

      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="grid h-full w-full grid-cols-3 gap-1">
          {tab === 'tickets' ? (
            <button
              type="button"
              onClick={onToggleExternal}
              className={`flex min-h-[38px] flex-col items-center justify-center rounded-lg px-1.5 py-1 text-center transition ${
                externalFilter === 'external'
                  ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-300'
                  : 'bg-violet-50 hover:bg-violet-100'
              }`}
            >
              <div className={typography('eyebrow')}>Externalitzats</div>
              <div className="mt-1 text-sm font-semibold leading-none text-slate-900">
                {externalizedCount}
              </div>
            </button>
          ) : null}
          {summaryStatuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onToggleStatus(status)}
              className={`flex min-h-[38px] flex-col items-center justify-center rounded-lg px-1.5 py-1 text-center transition ${
                activeStatuses.includes(status)
                  ? 'bg-slate-200 text-slate-900 ring-1 ring-slate-300'
                  : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className={typography('eyebrow')}>{STATUS_LABELS[status]}</div>
              <div className="mt-1 text-sm font-semibold leading-none text-slate-900">
                {statusCounts[status]}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
