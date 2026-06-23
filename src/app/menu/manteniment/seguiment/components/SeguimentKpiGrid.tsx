'use client'

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
    <div className="grid w-full gap-3 xl:grid-cols-6">
      <div className="flex min-h-[98px] flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Pendents de validar
        </div>
        <div className="text-[26px] font-semibold leading-none text-amber-900">
          {pendingValidationCount}
        </div>
        <div className="text-[11px] text-amber-700">Tasques en estat fet</div>
      </div>

      <div className="flex min-h-[98px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Dies oberts mig
        </div>
        <div className="text-[26px] font-semibold leading-none text-slate-900">{averageDays}</div>
        <div className="text-[11px] text-slate-500">Velocitat d&apos;execucio</div>
      </div>

      <div className="flex min-h-[98px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Externalitzats
        </div>
        <div className="text-[26px] font-semibold leading-none text-slate-900">
          {tab === 'tickets' ? externalizedCount : 0}
        </div>
        <div className="mt-1 text-xs text-slate-500">Només tickets</div>
      </div>

      <div className="flex min-h-[98px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Hores planificades
        </div>
        <div className="whitespace-nowrap text-[26px] font-semibold leading-none text-slate-900">
          {formatTrackedHours(totalPlannedMinutes)}
        </div>
        <div className="text-[11px] invisible">.</div>
      </div>

      <div className="flex min-h-[98px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Hores reals
        </div>
        <div className="whitespace-nowrap text-[26px] font-semibold leading-none text-slate-900">
          {formatTrackedHours(totalTrackedMinutes)}
        </div>
        <div className="text-[11px] invisible">.</div>
      </div>

      <div className="flex min-h-[98px] items-stretch rounded-2xl border border-slate-200 bg-white p-2.5">
        <div className="grid h-full w-full grid-cols-3 gap-1">
          {summaryStatuses.map((status) => (
            <div
              key={status}
              className="flex min-h-[36px] flex-col items-center justify-center rounded-md bg-slate-50 px-1.5 py-1 text-center"
            >
              <div className="text-[8px] font-medium uppercase tracking-wide text-slate-400">
                {STATUS_LABELS[status]}
              </div>
              <div className="mt-0.5 text-[13px] font-semibold leading-none text-slate-900">
                {statusCounts[status]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
