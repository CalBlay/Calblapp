'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { useTransports } from '@/hooks/useTransports'
import { normalizeRole } from '@/lib/roles'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import MaintenanceNotificationsBell from '@/app/menu/manteniment/components/MaintenanceNotificationsBell'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'
import MaintenancePermissionGate from '../../components/MaintenancePermissionGate'
import type { JourneyStatus } from '@/lib/maintenanceJourneyStatus'
import JourneyKindFilter from './components/JourneyKindFilter'
import JourneyWorkList from './components/JourneyWorkList'
import TicketJourneyStatusModal from './components/TicketJourneyStatusModal'
import { useJourneyDateRange } from './hooks/useJourneyDateRange'
import { useJourneyFiltersPanel } from './hooks/useJourneyFiltersPanel'
import { useJourneySelectedTicket } from './hooks/useJourneySelectedTicket'
import { useJourneyWorkData } from './hooks/useJourneyWorkData'
import { buildExportRows, exportJourneyExcel, exportJourneyPdfTable } from './lib/export'
import { openPreventiuFitxa } from './lib/navigation'
import {
  getAllowedNextStatuses,
  MANAGER_JOURNEY_FILTER_STATUSES,
  WORKER_JOURNEY_FILTER_STATUSES,
} from './lib/status'
import type { MaintenanceStatus } from './lib/types'

type SessionUser = {
  id?: string
  role?: string
}

const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden; }
    #manteniment-fulls-print-root, #manteniment-fulls-print-root * { visibility: visible; }
    #manteniment-fulls-print-root { position: absolute; left: 0; top: 0; width: 100%; }
  }
`

export default function PreventiusFullsPage() {
  const { data: session } = useSession()
  const sessionUser = (session?.user || {}) as SessionUser
  const searchParams = useSearchParams()
  const { data: transports } = useTransports()
  const { canViewPath } = useUiPermissions()

  const role = normalizeRole(sessionUser.role || '')
  const userId = String(sessionUser.id || '').trim()
  const canFilterByWorker =
    role === 'admin' ||
    role === 'direccio' ||
    role === 'cap' ||
    canViewPath('/menu/manteniment/preventius')

  const queryStart = (searchParams?.get('start') || '').trim()
  const queryEnd = (searchParams?.get('end') || '').trim()

  const [refreshKey, setRefreshKey] = useState(0)
  const { filters, setMode, shiftRange, rangeLabel } = useJourneyDateRange(queryStart, queryEnd)

  const workData = useJourneyWorkData({
    filters,
    role,
    userId,
    canFilterByWorker,
    refreshKey,
  })

  const { selectedTicket, openTicket, closeSelectedTicket } = useJourneySelectedTicket(
    [...workData.ticketItems, ...workData.waitingTicketItems]
  )

  useJourneyFiltersPanel({
    canFilterByWorker,
    workerFilter: workData.workerFilter,
    setWorkerFilter: workData.setWorkerFilter,
    workerOptions: workData.workerOptions,
  })

  const transportById = useMemo(
    () => new Map((transports || []).map((transport) => [String(transport.id || ''), transport])),
    [transports]
  )

  const exportRows = useMemo(() => buildExportRows(workData.grouped), [workData.grouped])

  const exportItems = [
    {
      label: 'Excel (.xlsx)',
      onClick: () => void exportJourneyExcel(exportRows, filters),
      disabled: exportRows.length === 0,
    },
    {
      label: 'PDF (vista)',
      onClick: () => window.print(),
      disabled: workData.grouped.length === 0,
    },
    {
      label: 'PDF (taula)',
      onClick: () => exportJourneyPdfTable(exportRows, filters),
      disabled: exportRows.length === 0,
    },
  ]

  const allowedNext = (status: MaintenanceStatus) =>
    getAllowedNextStatuses(status, role) as JourneyStatus[]

  const visibleStatusOptions =
    workData.statusOptions.length > 0
      ? workData.statusOptions
      : role === 'treballador'
        ? WORKER_JOURNEY_FILTER_STATUSES
        : MANAGER_JOURNEY_FILTER_STATUSES

  const workerChip =
    canFilterByWorker && workData.workerFilter !== 'all'
      ? workData.workerOptions.find((w) => w.toLowerCase() === workData.workerFilter) ||
        workData.workerFilter
      : null

  const searchChip = workData.searchQuery.trim() || null

  return (
    <MaintenancePermissionGate path="/menu/manteniment/preventius/fulls">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 pb-8">
        <style>{PRINT_STYLES}</style>

        <ModuleHeader
          title="Manteniment"
          subtitle="Jornada"
          mainHref="/menu/manteniment"
          actions={
            <div className="flex items-center gap-2">
              <MaintenanceNotificationsBell />
              <ExportMenu items={exportItems} />
            </div>
          }
        />

        <MaintenanceToolbar
          rangeLabel={rangeLabel}
          onPrev={() => shiftRange('prev')}
          onNext={() => shiftRange('next')}
          modeValue={filters.mode}
          modeOptions={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Setmana' },
            { value: 'month', label: 'Mes' },
          ]}
          onModeChange={(value) => setMode(value as typeof filters.mode)}
          onOpenFilters={canFilterByWorker ? () => undefined : undefined}
          centerSlot={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={workData.searchQuery}
                onChange={(e) => workData.setSearchQuery(e.target.value)}
                placeholder="Codi, titol, ubicacio, maquina, vehicle o operari"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400"
              />
              {workData.searchQuery ? (
                <button
                  type="button"
                  onClick={() => workData.setSearchQuery('')}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Netejar cerca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          }
        />

        <JourneyKindFilter
          value={workData.kindFilter}
          onChange={workData.setKindFilter}
          workerChip={workerChip}
          statusValue={workData.statusFilter}
          onStatusChange={workData.setStatusFilter}
          statusOptions={visibleStatusOptions}
          searchChip={searchChip}
        />

        <div
          id="manteniment-fulls-print-root"
          className="overflow-hidden rounded-2xl border bg-white"
        >
          <div className="divide-y">
            <JourneyWorkList
              grouped={workData.grouped}
              transportById={transportById}
              onOpenTicket={openTicket}
              onOpenFitxa={openPreventiuFitxa}
            />
          </div>
        </div>

        {workData.waitingGrouped.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border bg-white">
            <div className="border-b bg-amber-50/70 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Tickets en espera</div>
              <p className="mt-1 text-xs text-slate-600">
                Pendents de reprendre, encara que la data planificada no sigui avui.
              </p>
            </div>
            <div className="divide-y">
              <JourneyWorkList
                grouped={workData.waitingGrouped}
                transportById={transportById}
                onOpenTicket={openTicket}
                onOpenFitxa={openPreventiuFitxa}
              />
            </div>
          </div>
        ) : null}

        {selectedTicket ? (
          <TicketJourneyStatusModal
            ticket={selectedTicket}
            allowedNext={allowedNext}
            onClose={closeSelectedTicket}
            onSaved={() => {
              setRefreshKey((prev) => prev + 1)
              closeSelectedTicket()
            }}
          />
        ) : null}
      </div>
    </MaintenancePermissionGate>
  )
}
