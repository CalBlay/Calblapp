'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { useTransports } from '@/hooks/useTransports'
import { normalizeRole } from '@/lib/roles'
import { RoleGuard } from '@/lib/withRoleGuard'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'
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
import { getAllowedNextStatuses, getStatusLabel } from './lib/status'
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

  const role = normalizeRole(sessionUser.role || '')
  const userId = String(sessionUser.id || '').trim()
  const canFilterByWorker = role === 'admin' || role === 'direccio' || role === 'cap'

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
    workData.ticketItems
  )

  useJourneyFiltersPanel({
    canFilterByWorker,
    workerFilter: workData.workerFilter,
    setWorkerFilter: workData.setWorkerFilter,
    statusFilter: workData.statusFilter,
    setStatusFilter: workData.setStatusFilter,
    workerOptions: workData.workerOptions,
    statusOptions: workData.statusOptions,
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

  const workerChip =
    canFilterByWorker && workData.workerFilter !== 'all'
      ? workData.workerOptions.find((w) => w.toLowerCase() === workData.workerFilter) ||
        workData.workerFilter
      : null

  const statusChip =
    workData.statusFilter !== 'all'
      ? getStatusLabel(workData.statusFilter, workData.statusFilter)
      : null

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 pb-8">
        <style>{PRINT_STYLES}</style>

        <ModuleHeader
          title="Manteniment"
          subtitle="Jornada"
          mainHref="/menu/manteniment"
          actions={<ExportMenu items={exportItems} />}
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
          onOpenFilters={() => undefined}
        />

        <JourneyKindFilter
          value={workData.kindFilter}
          onChange={workData.setKindFilter}
          workerChip={workerChip}
          statusChip={statusChip}
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
    </RoleGuard>
  )
}
