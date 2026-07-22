'use client'

import ResetFilterButton from '@/components/ui/ResetFilterButton'
import type { MaintenanceStatus, TabKey } from '../types'
import { MAINTENANCE_EXTERNAL_FLOW_LABELS } from '@/lib/maintenanceStatus'

type Props = {
  tab: TabKey
  dateMode: 'all' | 'planned'
  externalFilter: 'all' | 'internal' | 'external'
  statusFilter: MaintenanceStatus[]
  workerFilter: string
  centerFilter: string
  locationFilter: string
  zoneFilter: string
  pendingValidationOnly: boolean
  stalledOnly: boolean
  centerOptions: string[]
  locationOptions: string[]
  zoneOptions: string[]
  workerOptions: string[]
  onDateModeChange: (value: 'all' | 'planned') => void
  onExternalFilterChange: (value: 'all' | 'internal' | 'external') => void
  onStatusFilterChange: (value: MaintenanceStatus[]) => void
  onWorkerFilterChange: (value: string) => void
  onCenterFilterChange: (value: string) => void
  onLocationFilterChange: (value: string) => void
  onZoneFilterChange: (value: string) => void
  onPendingValidationOnlyChange: (value: boolean) => void
  onStalledOnlyChange: (value: boolean) => void
  onReset: () => void
}

export default function SeguimentSidebarFilters({
  tab,
  dateMode,
  externalFilter,
  workerFilter,
  centerFilter,
  locationFilter,
  zoneFilter,
  pendingValidationOnly,
  stalledOnly,
  centerOptions,
  locationOptions,
  zoneOptions,
  workerOptions,
  onDateModeChange,
  onExternalFilterChange,
  onWorkerFilterChange,
  onCenterFilterChange,
  onLocationFilterChange,
  onZoneFilterChange,
  onPendingValidationOnlyChange,
  onStalledOnlyChange,
  onReset,
}: Props) {
  return (
    <div className="space-y-4 p-4">
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={dateMode !== 'all'}
          onChange={(e) => onDateModeChange(e.target.checked ? 'planned' : 'all')}
        />
        Aplicar filtre de dates
      </label>

      {tab === 'tickets' ? (
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Flux</span>
          <select
            value={externalFilter}
            onChange={(e) =>
              onExternalFilterChange(e.target.value as 'all' | 'internal' | 'external')
            }
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">{MAINTENANCE_EXTERNAL_FLOW_LABELS.all}</option>
            <option value="internal">{MAINTENANCE_EXTERNAL_FLOW_LABELS.internal}</option>
            <option value="external">{MAINTENANCE_EXTERNAL_FLOW_LABELS.external}</option>
          </select>
        </label>
      ) : null}

      <label className="space-y-2 text-sm text-slate-700">
        <span className="font-medium">Operari</span>
        <select
          value={workerFilter}
          onChange={(e) => onWorkerFilterChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tots</option>
          {workerOptions.map((worker) => (
            <option key={worker} value={worker}>
              {worker}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm text-slate-700">
        <span className="font-medium">Centre</span>
        <select
          value={centerFilter}
          onChange={(e) => onCenterFilterChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tots</option>
          {centerOptions.map((center) => (
            <option key={center} value={center}>
              {center}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm text-slate-700">
        <span className="font-medium">Ubicacio</span>
        <select
          value={locationFilter}
          onChange={(e) => onLocationFilterChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Totes</option>
          {locationOptions.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm text-slate-700">
        <span className="font-medium">Zona</span>
        <select
          value={zoneFilter}
          onChange={(e) => onZoneFilterChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Totes</option>
          {zoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={pendingValidationOnly}
          onChange={(e) => onPendingValidationOnlyChange(e.target.checked)}
        />
        Nomes pendents de validar
      </label>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={stalledOnly}
          onChange={(e) => onStalledOnlyChange(e.target.checked)}
        />
        Nomes oberts 3+ dies
      </label>

      <div className="flex justify-end">
        <ResetFilterButton onClick={onReset} />
      </div>
    </div>
  )
}
