'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Calendar, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
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
import { parseDate, parseDateFromParts, STATUSES, STATUS_LABELS } from './utils'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'

function formatDayLabel(day: string) {
  const parsed = parseISO(day)
  if (Number.isNaN(parsed.getTime())) return day
  return format(parsed, 'dd/MM/yyyy', { locale: ca })
}

const STATUS_FILTER_STYLES: Record<
  MaintenanceStatus,
  { active: string; dot: string; label: string }
> = {
  nou: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Nou',
  },
  assignat: {
    active: 'bg-sky-100 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
    label: 'Assignat',
  },
  reassignat: {
    active: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    label: 'Reassignat',
  },
  en_curs: {
    active: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'En curs',
  },
  espera: {
    active: 'bg-slate-200 text-slate-800 border-slate-300',
    dot: 'bg-slate-500',
    label: 'Espera',
  },
  fet: {
    active: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    label: 'Fet',
  },
  no_fet: {
    active: 'bg-rose-100 text-rose-800 border-rose-200',
    dot: 'bg-rose-500',
    label: 'No fet',
  },
  resolut: {
    active: 'bg-teal-100 text-teal-800 border-teal-200',
    dot: 'bg-teal-500',
    label: 'Resolt',
  },
  validat: {
    active: 'bg-violet-100 text-violet-800 border-violet-200',
    dot: 'bg-violet-500',
    label: 'Validat',
  },
}

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
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus[]>([])
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
          setStatusFilter([])
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

  const toggleStatusFilter = useCallback((status: MaintenanceStatus) => {
    setStatusFilter((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    )
  }, [])

  const daySections = useMemo(() => {
    const map = new Map<string, typeof currentRows>()
    currentRows.forEach((row) => {
      const date =
        tab === 'tickets'
          ? parseDate((row as Ticket).plannedStart || null)
          : parseDateFromParts(row.plannedDate, row.plannedStart)
      if (!date) return
      const key = format(date, 'yyyy-MM-dd')
      const list = map.get(key) || []
      list.push(row)
      map.set(key, list)
    })

    const days = eachDayOfInterval({
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end),
    })

    return days
      .map((day) => {
        const key = format(day, 'yyyy-MM-dd')
        const items = map.get(key) || []
        return {
          day: key,
          items,
          count: items.length,
        }
      })
      .filter((section) => section.count > 0)
  }, [currentRows, dateRange.end, dateRange.start, tab])

  return (
    <MaintenancePermissionGate path="/menu/manteniment/seguiment">
      <div className="flex w-full max-w-none flex-col gap-5 p-4 pb-8">
        <ModuleHeader title="Manteniment" subtitle="Seguiment" mainHref="/menu/manteniment" />

        <CorporateFiltersShell variant="toolbar" bodyClassName="p-0">
          <MaintenanceToolbar
            className="border-0 bg-transparent px-0 py-0 shadow-none"
            bodyClassName="flex-col items-stretch gap-0 xl:flex-row xl:flex-wrap xl:items-center"
            leftSlot={
              <>
                <FilterButton />
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
              </>
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
                <div className="flex flex-wrap items-center gap-2">
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
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex flex-wrap items-center gap-2">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatusFilter(status)}
                      className={[
                        'rounded-full px-3 py-2 text-xs font-semibold border inline-flex items-center gap-2',
                        statusFilter.includes(status)
                          ? STATUS_FILTER_STYLES[status].active
                          : 'bg-white text-gray-700 border-gray-200',
                      ].join(' ')}
                      title={`Filtrar per estat ${STATUS_FILTER_STYLES[status].label}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${STATUS_FILTER_STYLES[status].dot}`} />
                      {STATUS_FILTER_STYLES[status].label}
                    </button>
                  ))}
                </div>
              </div>
            }
            bottomSlot={
              <CorporateFiltersActiveRow>
                {statusFilter.map((status) => (
                  <CorporateActiveFilterChip key={status}>
                    {STATUS_LABELS[status]}
                  </CorporateActiveFilterChip>
                ))}
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

            <div className="space-y-6 p-3 sm:space-y-7 sm:p-4 lg:space-y-6 lg:p-4">
              {currentRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-7 text-sm text-slate-500">
                  No hi ha registres amb aquests filtres.
                </div>
              ) : null}

              {daySections.map((section) => (
                <section
                  key={section.day}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/45 p-2.5 sm:p-3"
                >
                  <header className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight text-slate-800">
                      {formatDayLabel(section.day)}
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700">
                        <Calendar className="h-3 w-3" aria-hidden />
                        {tab === 'tickets' ? 'Tickets' : 'Preventius'}
                      </span>
                    </h2>

                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {section.count} {section.count === 1 ? 'registre' : 'registres'}
                    </span>
                  </header>

                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                    {tab === 'tickets'
                      ? (section.items as Ticket[]).map((ticket) => (
                          <div
                            key={ticket.id}
                            className={expandedId === ticket.id ? 'xl:col-span-2 2xl:col-span-3' : ''}
                          >
                            <SeguimentTicketRow
                              ticket={ticket}
                              expanded={expandedId === ticket.id}
                              machineNameMap={machineNameMap}
                              canValidateTickets={canValidateTickets}
                              validatingTicketId={validatingTicketId}
                              onOpen={setOpenedTicket}
                              onReassign={setOpenedTicket}
                              onToggleExpanded={(id) =>
                                setExpandedId((prev) => (prev === id ? null : id))
                              }
                              onValidate={handleCapValidateTicket}
                            />
                          </div>
                        ))
                      : section.items.map((item) => (
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
