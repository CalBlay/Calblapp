'use client'

import { useEffect } from 'react'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { getStatusLabel } from '../lib/status'

type Params = {
  canFilterByWorker: boolean
  workerFilter: string
  setWorkerFilter: (value: string) => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  workerOptions: string[]
  statusOptions: string[]
}

export function useJourneyFiltersPanel({
  canFilterByWorker,
  workerFilter,
  setWorkerFilter,
  statusFilter,
  setStatusFilter,
  workerOptions,
  statusOptions,
}: Params) {
  const { setContent } = useFilters()

  useEffect(() => {
    setContent(
      <div className="space-y-4 p-4">
        {canFilterByWorker ? (
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Treballador</span>
            <select
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
            >
              <option value="all">Tots</option>
              {workerOptions.map((w) => (
                <option key={w} value={w.toLowerCase()}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Estat</span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tots</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status, status)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              setWorkerFilter('all')
              setStatusFilter('all')
            }}
          />
        </div>
      </div>
    )
  }, [
    canFilterByWorker,
    setContent,
    statusFilter,
    statusOptions,
    workerFilter,
    workerOptions,
    setStatusFilter,
    setWorkerFilter,
  ])
}
