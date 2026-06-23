'use client'

import ResetFilterButton from '@/components/ui/ResetFilterButton'
import type { UserItem } from '@/app/menu/manteniment/tickets/types'
import type { TabKey } from '../types'
import { STATUSES, STATUS_LABELS } from '../utils'

type Props = {
  tab: TabKey
  dateMode: 'all' | 'planned'
  externalFilter: 'all' | 'internal' | 'external'
  statusFilter: string
  workerFilter: string
  locationFilter: string
  pendingValidationOnly: boolean
  stalledOnly: boolean
  locations: string[]
  users: UserItem[]
  onDateModeChange: (value: 'all' | 'planned') => void
  onExternalFilterChange: (value: 'all' | 'internal' | 'external') => void
  onStatusFilterChange: (value: string) => void
  onWorkerFilterChange: (value: string) => void
  onLocationFilterChange: (value: string) => void
  onPendingValidationOnlyChange: (value: boolean) => void
  onStalledOnlyChange: (value: boolean) => void
  onReset: () => void
}

export default function SeguimentSidebarFilters({
  tab,
  dateMode,
  externalFilter,
  statusFilter,
  workerFilter,
  locationFilter,
  pendingValidationOnly,
  stalledOnly,
  locations,
  users,
  onDateModeChange,
  onExternalFilterChange,
  onStatusFilterChange,
  onWorkerFilterChange,
  onLocationFilterChange,
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

      <label className="space-y-2 text-sm text-slate-700">
        <span className="font-medium">Estat</span>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tots</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
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
            <option value="all">Tots</option>
            <option value="internal">Interns</option>
            <option value="external">Derivats a proveidor</option>
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
          {users.map((user) => (
            <option key={user.id} value={user.name}>
              {user.name}
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
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
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
