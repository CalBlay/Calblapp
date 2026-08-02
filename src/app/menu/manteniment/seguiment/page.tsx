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
  MAINTENANCE_EXTERNAL_FLOW_LABELS,
  MAINTENANCE_STATUS_LABELS,
} from '@/lib/maintenanceStatus'
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
import { getTicketLastMovementAt, parseDate, parseDateFromParts } from './utils'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'
import { typography } from '@/lib/typography'
import { resolveMaintenanceSite } from '@/lib/maintenanceLocationCatalog'

const STATUS_LABELS = MAINTENANCE_STATUS_LABELS
function formatDayLabel(day: string) {
  const parsed = parseISO(day)
  if (Number.isNaN(parsed.getTime())) return day
  return format(parsed, 'dd/MM/yyyy', { locale: ca })
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
  const [centerFilter, setCenterFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
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
    centers,
    locations,
    machines,
    users,
    loading,
    error,
    loadData,
  } = useSeguimentData()

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

  const dateScopedFilterOptions = useMemo(() => {
    const workerMap = new Map<string, string>()
    const centerMap = new Map<string, string>()
    const scopedSites: Array<{ center: string; location: string; zone: string }> = []

    if (tab === 'tickets') {
      tickets
        .filter((ticket) => applyDateFilter(getTicketLastMovementAt(ticket)))
        .forEach((ticket) => {
          const site = resolveMaintenanceSite(centers, ticket.workLocation, ticket.location)
          scopedSites.push(site)
          if (site.center) centerMap.set(site.center.toLowerCase(), site.center)
          ;(ticket.assignedToNames || []).forEach((name) => {
            const value = String(name || '').trim()
            if (value) workerMap.set(value.toLowerCase(), value)
          })
        })
    } else {
      preventius
        .filter((item) =>
          applyDateFilter(parseDateFromParts(item.plannedDate, item.plannedStart)?.getTime() || null)
        )
        .forEach((item) => {
          const site = resolveMaintenanceSite(centers, item.location)
          scopedSites.push(site)
          if (site.center) centerMap.set(site.center.toLowerCase(), site.center)
          item.workerNames.forEach((name) => {
            const value = String(name || '').trim()
            if (value) workerMap.set(value.toLowerCase(), value)
          })
        })
    }

    const selectedCenter = centerFilter !== 'all' ? centerFilter : ''
    const selectedLocation = locationFilter !== 'all' ? locationFilter : ''
    const locationMap = new Map<string, string>()
    const zoneMap = new Map<string, string>()

    scopedSites
      .filter((site) => !selectedCenter || site.center === selectedCenter)
      .forEach((site) => {
        if (site.location) locationMap.set(site.location.toLowerCase(), site.location)
      })

    scopedSites
      .filter((site) => !selectedCenter || site.center === selectedCenter)
      .filter((site) => !selectedLocation || site.location === selectedLocation)
      .forEach((site) => {
        if (site.zone) zoneMap.set(site.zone.toLowerCase(), site.zone)
      })

    const sort = (values: string[]) =>
      values.sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))

    return {
      workerOptions: sort([...workerMap.values()]),
      centerOptions: sort([...centerMap.values()]),
      locationOptions: sort([...locationMap.values()]),
      zoneOptions: sort([...zoneMap.values()]),
    }
  }, [applyDateFilter, centerFilter, centers, locationFilter, preventius, tab, tickets])

  useEffect(() => {
    setContent(
      <SeguimentSidebarFilters
        tab={tab}
        dateMode={dateMode}
        externalFilter={externalFilter}
        statusFilter={statusFilter}
        workerFilter={workerFilter}
        centerFilter={centerFilter}
        locationFilter={locationFilter}
        zoneFilter={zoneFilter}
        pendingValidationOnly={pendingValidationOnly}
        stalledOnly={stalledOnly}
        centerOptions={dateScopedFilterOptions.centerOptions}
        locationOptions={dateScopedFilterOptions.locationOptions}
        zoneOptions={dateScopedFilterOptions.zoneOptions}
        workerOptions={dateScopedFilterOptions.workerOptions}
        onDateModeChange={setDateMode}
        onExternalFilterChange={setExternalFilter}
        onStatusFilterChange={setStatusFilter}
        onWorkerFilterChange={setWorkerFilter}
        onCenterFilterChange={(value) => {
          setCenterFilter(value)
          setLocationFilter('all')
          setZoneFilter('all')
        }}
        onLocationFilterChange={(value) => {
          setLocationFilter(value)
          setZoneFilter('all')
        }}
        onZoneFilterChange={setZoneFilter}
        onPendingValidationOnlyChange={setPendingValidationOnly}
        onStalledOnlyChange={setStalledOnly}
        onReset={() => {
          setDateMode('planned')
          setStatusFilter([])
          setExternalFilter('all')
          setWorkerFilter('all')
          setCenterFilter('all')
          setLocationFilter('all')
          setZoneFilter('all')
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
    dateScopedFilterOptions.centerOptions,
    dateScopedFilterOptions.locationOptions,
    dateScopedFilterOptions.workerOptions,
    dateScopedFilterOptions.zoneOptions,
    externalFilter,
    centerFilter,
    locationFilter,
    pendingValidationOnly,
    setContent,
    stalledOnly,
    statusFilter,
    tab,
    workerFilter,
    zoneFilter,
  ])

  const {
    ticketRows: _ticketRows,
    preventiuRows: _preventiuRows,
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
    centers,
    machines,
    dateMode,
    dateRange,
    statusFilter,
    workerFilter,
    centerFilter,
    locationFilter,
    zoneFilter,
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
    if (tab === 'tickets' && externalFilter === 'external') {
      setExternalFilter('all')
    }
    setStatusFilter((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    )
  }, [externalFilter, tab])

  const daySections = useMemo(() => {
    const map = new Map<string, typeof currentRows>()
    currentRows.forEach((row) => {
      const date =
        tab === 'tickets'
          ? parseDate(getTicketLastMovementAt(row as Ticket))
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
                {centerFilter !== 'all' ? (
                  <CorporateActiveFilterChip>{centerFilter}</CorporateActiveFilterChip>
                ) : null}
                {locationFilter !== 'all' ? (
                  <CorporateActiveFilterChip>{locationFilter}</CorporateActiveFilterChip>
                ) : null}
                {zoneFilter !== 'all' ? (
                  <CorporateActiveFilterChip>{zoneFilter}</CorporateActiveFilterChip>
                ) : null}
                {tab === 'tickets' && externalFilter !== 'all' ? (
                  <CorporateActiveFilterChip>
                    {externalFilter === 'external'
                      ? MAINTENANCE_EXTERNAL_FLOW_LABELS.external
                      : MAINTENANCE_EXTERNAL_FLOW_LABELS.internal}
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
          activeStatuses={statusFilter}
          externalFilter={externalFilter}
          pendingValidationOnly={pendingValidationOnly}
          onToggleStatus={toggleStatusFilter}
          onToggleExternal={() =>
            setExternalFilter((current) => {
              const next = current === 'external' ? 'all' : 'external'
              if (next === 'external') {
                setStatusFilter([])
              }
              return next
            })
          }
          onTogglePendingValidation={() =>
            setPendingValidationOnly((current) => !current)
          }
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
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className={typography('sectionTitle')}>
                  {tab === 'tickets' ? 'Tickets' : 'Preventius'}
                </div>
                <div className={typography('bodyXs')}>{currentRows.length} resultats</div>
              </div>
            </div>

            <div className="space-y-6 p-3 sm:space-y-7 sm:p-4 lg:space-y-6 lg:p-4">
              {currentRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-7 text-sm text-slate-500">
                  No hi ha registres amb aquests filtres.
                </div>
              ) : null}

              {daySections.map((section) => (
                <section
                  key={section.day}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/45 p-2.5 sm:p-3"
                >
                  <header className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight text-slate-900">
                      {formatDayLabel(section.day)}
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                        <Calendar className="h-3 w-3" aria-hidden />
                        {tab === 'tickets' ? 'Tickets' : 'Preventius'}
                      </span>
                    </h2>

                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
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
