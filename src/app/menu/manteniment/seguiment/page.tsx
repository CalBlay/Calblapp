'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useSession } from 'next-auth/react'
import { X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import {
  CorporateActiveFilterChip,
  CorporateFilterSearch,
  CorporateFiltersActiveRow,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { corporateFilterBadgeClass } from '@/lib/corporate-filters'
import {
  getCurrentMaintenanceWeekRange,
  matchesMaintenancePlannedDateFilter,
  type MaintenanceDateFilterMode,
} from '@/lib/maintenanceDateFilter'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { MAINTENANCE_TICKETS_VALIDATE_PERM } from '@/lib/maintenanceTicketsPermissions'
import { normalizeRole } from '@/lib/roles'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import PlannerTicketModal from '@/app/menu/manteniment/preventius/planificador/components/PlannerTicketModal'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import MaintenanceToolbar from '../components/MaintenanceToolbar'
import SeguimentKpiGrid from './components/SeguimentKpiGrid'
import SeguimentPreventiuRow from './components/SeguimentPreventiuRow'
import SeguimentSidebarFilters from './components/SeguimentSidebarFilters'
import SeguimentTicketRow from './components/SeguimentTicketRow'
import type { MaintenanceStatus, TabKey } from './types'
import { useSeguimentActions } from './hooks/useSeguimentActions'
import { useSeguimentData } from './hooks/useSeguimentData'
import { useSeguimentDerivedData } from './hooks/useSeguimentDerivedData'
import { parseDate, STATUS_LABELS } from './utils'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'

export default function MaintenanceSeguimentPage() {
  const { data: session } = useSession()
  const { hasAction } = useUiPermissions()
  const { setContent } = useFilters()

  const sessionUser = session?.user as
    | { role?: string | null; department?: string | null }
    | undefined

  const canValidateTickets = hasAction(MAINTENANCE_TICKETS_VALIDATE_PERM)
  const canValidatePreventius = useMemo(() => {
    const role = normalizeRole(sessionUser?.role || '')
    const department = String(sessionUser?.department || '')
    return (
      role === 'admin' ||
      role === 'direccio' ||
      (role === 'cap' && isMaintenanceCapDepartment(department))
    )
  }, [sessionUser?.department, sessionUser?.role])

  const [tab, setTab] = useState<TabKey>('tickets')
  const [dateMode, setDateMode] = useState<MaintenanceDateFilterMode>('planned')
  const [externalFilter, setExternalFilter] = useState<'all' | 'internal' | 'external'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [pendingValidationOnly, setPendingValidationOnly] = useState(false)
  const [stalledOnly, setStalledOnly] = useState(false)
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [openedTicket, setOpenedTicket] = useState<Ticket | null>(null)
  const [dateRange, setDateRange] = useState(getCurrentMaintenanceWeekRange)
  const {
    tickets,
    setTickets,
    preventius,
    locations,
    machines,
    users,
    loading,
    error,
    loadData,
  } = useSeguimentData()

  useEffect(() => {
    setContent(
      <SeguimentSidebarFilters
        tab={tab}
        dateMode={dateMode}
        externalFilter={externalFilter}
        statusFilter={statusFilter}
        workerFilter={workerFilter}
        locationFilter={locationFilter}
        pendingValidationOnly={pendingValidationOnly}
        stalledOnly={stalledOnly}
        locations={locations}
        users={users}
        onDateModeChange={setDateMode}
        onExternalFilterChange={setExternalFilter}
        onStatusFilterChange={setStatusFilter}
        onWorkerFilterChange={setWorkerFilter}
        onLocationFilterChange={setLocationFilter}
        onPendingValidationOnlyChange={setPendingValidationOnly}
        onStalledOnlyChange={setStalledOnly}
        onReset={() => {
          setDateMode('planned')
          setStatusFilter('all')
          setExternalFilter('all')
          setWorkerFilter('all')
          setLocationFilter('all')
          setPendingValidationOnly(false)
          setStalledOnly(false)
          setSearch('')
          setDateRange(getCurrentMaintenanceWeekRange())
          setDateResetSignal((current) => current + 1)
        }}
      />
    )
  }, [
    dateMode,
    externalFilter,
    locationFilter,
    locations,
    pendingValidationOnly,
    setContent,
    stalledOnly,
    statusFilter,
    tab,
    users,
    workerFilter,
  ])

  const applyDateFilter = useCallback(
    (value: number | string | null) =>
      matchesMaintenancePlannedDateFilter({
        mode: dateMode,
        start: dateRange.start,
        end: dateRange.end,
        plannedStart: value,
      }),
    [dateMode, dateRange.end, dateRange.start]
  )

  const {
    ticketRows,
    preventiuRows,
    currentRows,
    statusCounts,
    summaryStatuses,
    pendingValidationCount,
    averageDays,
    totalTrackedMinutes,
    totalPlannedMinutes,
    machineNameMap,
    externalizedCount,
  } = useSeguimentDerivedData({
    tab,
    tickets,
    preventius,
    machines,
    dateMode,
    dateRange,
    statusFilter,
    workerFilter,
    locationFilter,
    externalFilter,
    pendingValidationOnly,
    stalledOnly,
    search,
    applyDateMatch: applyDateFilter,
  })
  const {
    validatingTicketId,
    validatingPreventiuId,
    openPreventiu,
    handleCapValidateTicket,
    handleValidatePreventiu,
  } = useSeguimentActions({
    loadData,
    setTickets,
  })

  return (
    <MaintenancePermissionGate path="/menu/manteniment/seguiment">
      <div className="flex w-full max-w-none flex-col gap-5 p-4 pb-8">
        <ModuleHeader title="Manteniment" subtitle="Seguiment" mainHref="/menu/manteniment" />

        <CorporateFiltersShell variant="toolbar" bodyClassName="p-0">
          <MaintenanceToolbar
            className="border-0 bg-transparent px-0 py-0 shadow-none"
            bodyClassName="flex-col items-stretch gap-0 xl:flex-row xl:flex-wrap xl:items-center"
            leftSlot={
              <SmartFilters
                modeDefault="week"
                modeOptions={['week', 'month', 'year', 'day', 'range']}
                resetSignal={dateResetSignal}
                role="Treballador"
                showDepartment={false}
                showWorker={false}
                showLocation={false}
                showStatus={false}
                compact
                onChange={(f: SmartFiltersChange) =>
                  f.start && f.end ? setDateRange({ start: f.start, end: f.end }) : null
                }
                initialStart={dateRange.start}
                initialEnd={dateRange.end}
              />
            }
            centerSlot={
              <div className="relative min-w-[260px]">
                <CorporateFilterSearch
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === 'tickets'
                      ? 'Codi, maquina, ubicacio o descripcio...'
                      : 'Preventiu, ubicacio o operari...'
                  }
                  className="pr-10"
                />
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            }
            rightSlot={
              <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
                {(['tickets', 'preventius'] as TabKey[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setTab(item)
                      setExpandedId(null)
                    }}
                    className={corporateFilterBadgeClass(tab === item)}
                  >
                    {item === 'tickets' ? 'Tickets' : 'Preventius'}
                  </button>
                ))}
              </div>
            }
            onOpenFilters={() => undefined}
            bottomSlot={
              <CorporateFiltersActiveRow>
                {statusFilter !== 'all' ? (
                  <CorporateActiveFilterChip>
                    {STATUS_LABELS[statusFilter as MaintenanceStatus]}
                  </CorporateActiveFilterChip>
                ) : null}
                {workerFilter !== 'all' ? (
                  <CorporateActiveFilterChip>{workerFilter}</CorporateActiveFilterChip>
                ) : null}
                {locationFilter !== 'all' ? (
                  <CorporateActiveFilterChip>{locationFilter}</CorporateActiveFilterChip>
                ) : null}
                {tab === 'tickets' && externalFilter !== 'all' ? (
                  <CorporateActiveFilterChip>
                    {externalFilter === 'external' ? 'Derivats a proveidor' : 'Interns'}
                  </CorporateActiveFilterChip>
                ) : null}
                {pendingValidationOnly ? (
                  <CorporateActiveFilterChip variant="amber">
                    Pendents de validar
                  </CorporateActiveFilterChip>
                ) : null}
                {stalledOnly ? (
                  <CorporateActiveFilterChip variant="rose">Oberts 3+ dies</CorporateActiveFilterChip>
                ) : null}
                {search.trim() ? (
                  <CorporateActiveFilterChip>Cerca activa</CorporateActiveFilterChip>
                ) : null}
              </CorporateFiltersActiveRow>
            }
          />
        </CorporateFiltersShell>

        <SeguimentKpiGrid
          pendingValidationCount={pendingValidationCount}
          averageDays={averageDays}
          tab={tab}
          externalizedCount={externalizedCount}
          totalPlannedMinutes={totalPlannedMinutes}
          totalTrackedMinutes={totalTrackedMinutes}
          summaryStatuses={summaryStatuses}
          statusCounts={statusCounts}
        />

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Carregant seguiment...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {tab === 'tickets' ? 'Tickets' : 'Preventius'}
                </div>
                <div className="text-xs text-slate-500">{currentRows.length} resultats</div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {currentRows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-slate-500">
                  No hi ha registres amb aquests filtres.
                </div>
              ) : null}

              {tab === 'tickets'
                ? ticketRows.map((ticket) => (
                    <SeguimentTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      expanded={expandedId === ticket.id}
                      machineNameMap={machineNameMap}
                      canValidateTickets={canValidateTickets}
                      validatingTicketId={validatingTicketId}
                      onOpen={setOpenedTicket}
                      onToggleExpanded={(id) =>
                        setExpandedId((prev) => (prev === id ? null : id))
                      }
                      onValidate={handleCapValidateTicket}
                    />
                  ))
                : preventiuRows.map((item) => (
                    <SeguimentPreventiuRow
                      key={item.id}
                      item={item}
                      expanded={expandedId === item.id}
                      canValidatePreventius={canValidatePreventius}
                      validatingPreventiuId={validatingPreventiuId}
                      onOpen={openPreventiu}
                      onToggleExpanded={(id) =>
                        setExpandedId((prev) => (prev === id ? null : id))
                      }
                      onValidate={handleValidatePreventiu}
                    />
                  ))}
            </div>
          </section>
        ) : null}

        {openedTicket ? (
          <PlannerTicketModal
            ticketId={openedTicket.id}
            initialTicket={openedTicket}
            initialDate={format(
              parseDate(openedTicket.plannedStart || openedTicket.createdAt) || new Date(),
              'yyyy-MM-dd'
            )}
            initialStartTime={
              parseDate(openedTicket.plannedStart)
                ? format(parseDate(openedTicket.plannedStart) as Date, 'HH:mm')
                : '08:00'
            }
            initialDurationMinutes={Math.max(30, Number(openedTicket.estimatedMinutes || 60))}
            locations={locations}
            machines={machines}
            users={users}
            onClose={() => setOpenedTicket(null)}
            onRefresh={() => loadData({ silent: true })}
          />
        ) : null}
      </div>
    </MaintenancePermissionGate>
  )
}
