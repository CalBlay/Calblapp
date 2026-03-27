'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { RoleGuard } from '@/lib/withRoleGuard'
import ModuleHeader from '@/components/layout/ModuleHeader'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { normalizeRole } from '@/lib/roles'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { markTicketSeen } from '@/lib/maintenanceSeen'
import { formatDateOnly, formatDateTimeValue } from '@/lib/date-format'
import { typography } from '@/lib/typography'
import { useMaintenanceTickets } from './useMaintenanceTickets'
import type { TicketPriority, TicketStatus } from './types'
import TicketsList from './components/TicketsList'
import CreateTicketModal from './components/CreateTicketModal'
import AssignTicketModal from './components/AssignTicketModal'

type SessionUser = {
  id?: string
  role?: string
  department?: string
}

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const STATUS_LABELS: Record<TicketStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Validat',
  validat: 'Validat',
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

const DATE_MODE_LABELS: Record<'all' | 'planned' | 'created' | 'updated' | 'completed', string> = {
  all: 'Sense filtre de data',
  planned: 'Data planificada',
  created: 'Data creacio',
  updated: 'Ultim canvi',
  completed: 'Data tancament',
}

const statusBadgeClasses: Record<TicketStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-blue-100 text-blue-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  resolut: 'bg-purple-100 text-purple-800',
  validat: 'bg-purple-100 text-purple-800',
}

const priorityBadgeClasses: Record<TicketPriority, string> = {
  urgent: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-slate-100 text-slate-700',
  baixa: 'bg-blue-100 text-blue-700',
}

export default function MaintenanceTicketsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setContent } = useFilters()
  const sessionUser = (session?.user || {}) as SessionUser
  const department = normalizeDept(sessionUser.department || '')
  const userRole = normalizeRole(sessionUser.role || '')
  const isMaintenance = department === 'manteniment'
  const isMaintenanceCap = userRole === 'cap' && isMaintenanceCapDepartment(department)
  const canManageAllTickets =
    userRole === 'admin' ||
    userRole === 'direccio' ||
    (userRole === 'cap' && isMaintenanceCapDepartment(department))
  const hasAccess =
    userRole === 'admin' ||
    userRole === 'direccio' ||
    userRole === 'cap' ||
    userRole === 'treballador' ||
    userRole === 'comercial' ||
    userRole === 'usuari'

  const formatDateTime = (value?: number | string | null) => formatDateTimeValue(value, '')
  const [dateResetSignal, setDateResetSignal] = useState(0)

  useEffect(() => {
    if (status === 'loading') return
    if (!hasAccess) router.replace('/menu')
  }, [hasAccess, router, status])

  const {
    role: ticketRole,
    userId,
    canValidate,
    canReopen,
    canExternalize,
    tickets,
    loading,
    error,
    hasMoreTickets,
    loadingMoreTickets,
    filters,
    setFilters,
    locations,
    machines,
    showCreate,
    setShowCreate,
    createLocation,
    setCreateLocation,
    createMachine,
    setCreateMachine,
    locationQuery,
    setLocationQuery,
    machineQuery,
    setMachineQuery,
    showLocationList,
    setShowLocationList,
    showMachineList,
    setShowMachineList,
    createDescription,
    setCreateDescription,
    createPriority,
    setCreatePriority,
    createImagePreview,
    createBusy,
    imageError,
    selected,
    setSelected,
    assignBusy,
    externalizeBusy,
    assignDate,
    setAssignDate,
    assignStartTime,
    setAssignStartTime,
    assignDuration,
    setAssignDuration,
    workerCount,
    setWorkerCount,
    availableIds,
    availabilityLoading,
    showHistory,
    setShowHistory,
    detailsLocation,
    setDetailsLocation,
    detailsWorkLocation,
    setDetailsWorkLocation,
    detailsMachine,
    setDetailsMachine,
    detailsDescription,
    setDetailsDescription,
    detailsPriority,
    setDetailsPriority,
    maintenanceUsers,
    furgonetes,
    handleImageChange,
    handleCreateTicket,
    handleAssign,
    handleStatusChange,
    handleReopen,
    handleAssignVehicle,
    handleUpdateDetails,
    handleExternalize,
    handleDelete,
    fetchMoreTickets,
    groupedTickets,
    ticketSummary,
  } = useMaintenanceTickets()

  useEffect(() => {
    setContent(
      <div key={`tickets-filters-${filters.dateMode ?? 'all'}-${dateResetSignal}`} className="space-y-4 p-4">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Tipus de data</span>
          <select
            value={filters.dateMode ?? 'all'}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateMode: e.target.value as typeof prev.dateMode }))}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Sense filtre de data</option>
            <option value="planned">Data planificada</option>
            <option value="created">Data creacio</option>
            <option value="updated">Ultim canvi</option>
            <option value="completed">Data tancament</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Estat</span>
          <select
            value={filters.status ?? '__all__'}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="__all__">Tots</option>
            <option value="nou">{STATUS_LABELS.nou}</option>
            <option value="assignat">{STATUS_LABELS.assignat}</option>
            <option value="en_curs">{STATUS_LABELS.en_curs}</option>
            <option value="espera">{STATUS_LABELS.espera}</option>
            <option value="fet">{STATUS_LABELS.fet}</option>
            <option value="no_fet">{STATUS_LABELS.no_fet}</option>
            {canValidate ? <option value="validat">{STATUS_LABELS.validat}</option> : null}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Importancia</span>
          <select
            value={filters.priority ?? '__all__'}
            onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="__all__">Totes</option>
            <option value="urgent">{PRIORITY_LABELS.urgent}</option>
            <option value="alta">{PRIORITY_LABELS.alta}</option>
            <option value="normal">{PRIORITY_LABELS.normal}</option>
            <option value="baixa">{PRIORITY_LABELS.baixa}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Ubicació</span>
          <select
            value={filters.location ?? '__all__'}
            onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="__all__">Totes</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              const start = startOfWeek(new Date(), { weekStartsOn: 1 })
              const end = endOfWeek(new Date(), { weekStartsOn: 1 })
              const next = {
                ...filters,
                start: format(start, 'yyyy-MM-dd'),
                end: format(end, 'yyyy-MM-dd'),
                status: '__all__',
                priority: '__all__',
                location: '__all__',
                dateMode: 'all' as const,
              }
              setFilters(next)
              setDateResetSignal((current) => current + 1)
            }}
          />
        </div>
      </div>
    )

    return () => setContent(null)
  }, [canValidate, dateResetSignal, filters, locations, setContent, setFilters])

  const displayStatusLabels: Record<TicketStatus, string> = canValidate
    ? STATUS_LABELS
    : {
        ...STATUS_LABELS,
        resolut: 'Fet',
        validat: 'Fet',
      }

  const displayStatusBadgeClasses: Record<TicketStatus, string> = canValidate
    ? statusBadgeClasses
    : {
        ...statusBadgeClasses,
        resolut: statusBadgeClasses.fet,
        validat: statusBadgeClasses.fet,
      }

  const queryTicketId = (searchParams?.get('ticketId') || '').trim()
  const queryStart = (searchParams?.get('start') || '').trim()
  const queryEnd = (searchParams?.get('end') || '').trim()

  const closeSelectedTicket = () => {
    setSelected(null)
    if (!searchParams || !queryTicketId) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('ticketId')
    const nextQuery = params.toString()
    router.replace(nextQuery ? `/menu/manteniment/tickets?${nextQuery}` : '/menu/manteniment/tickets')
  }

  useEffect(() => {
    if (!queryStart && !queryEnd) return
    setFilters((prev) => {
      const nextStart = queryStart || prev.start
      const nextEnd = queryEnd || prev.end
      if (prev.start === nextStart && prev.end === nextEnd) return prev
      return { ...prev, start: nextStart, end: nextEnd }
    })
  }, [queryEnd, queryStart, setFilters])

  useEffect(() => {
    if (!queryTicketId) return
    if (selected?.id === queryTicketId) return

    const existing = tickets.find((ticket) => String(ticket.id) === queryTicketId)
    if (existing) {
      setSelected(existing)
      return
    }
    if (loading) return

    let cancelled = false
    const loadSingle = async () => {
      try {
        const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(queryTicketId)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled && json?.ticket) setSelected(json.ticket)
      } catch {
        return
      }
    }

    void loadSingle()
    return () => {
      cancelled = true
    }
  }, [loading, queryTicketId, selected?.id, setSelected, tickets])

  if (!hasAccess && status !== 'loading') return null

  return (
      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador', 'comercial', 'usuari']}>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-8">
        <ModuleHeader
          title="Manteniment"
          subtitle="Tickets"
          mainHref="/menu/manteniment"
          actions={
            hasAccess ? (
              <button
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={() => setShowCreate(true)}
              >
                + Nou ticket
              </button>
            ) : undefined
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
            <div className="shrink-0">
              <SmartFilters
                modeDefault="week"
                modeOptions={['week', 'month', 'year', 'day', 'range']}
                resetSignal={dateResetSignal}
                role="Treballador"
                showDepartment={false}
                showWorker={false}
                showLocation={false}
                showStatus={false}
                onChange={(next: SmartFiltersChange) =>
                  setFilters((prev) => ({
                    ...prev,
                    start: next.start || '',
                    end: next.end || '',
                  }))
                }
                initialStart={filters.start}
                initialEnd={filters.end}
              />
            </div>
            <div className="flex min-w-[260px] flex-1 items-center gap-2">
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {DATE_MODE_LABELS[filters.dateMode ?? 'all']}
              </span>
              {(filters.dateMode ?? 'all') !== 'all' && filters.start && filters.end ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {filters.start === filters.end
                    ? formatDateOnly(filters.start, filters.start)
                    : `${formatDateOnly(filters.start, filters.start)} - ${formatDateOnly(filters.end, filters.end)}`}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterButton />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.status && filters.status !== '__all__' ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {STATUS_LABELS[filters.status as TicketStatus]}
              </span>
            ) : null}
            {filters.priority && filters.priority !== '__all__' ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {PRIORITY_LABELS[filters.priority as TicketPriority]}
              </span>
            ) : null}
            {filters.location && filters.location !== '__all__' ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {filters.location}
              </span>
            ) : null}
            {(filters.dateMode ?? 'all') !== 'all' ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {DATE_MODE_LABELS[filters.dateMode ?? 'all']}
              </span>
            ) : null}
          </div>
        </div>

        {loading && <p className="text-sm text-gray-500">Carregant...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border bg-white px-4 py-3">
            <div className={typography('eyebrow')}>
              Nous i reoberts
            </div>
            <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.inbox}</div>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-3">
            <div className={typography('eyebrow')}>
              Planificats
            </div>
            <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.planned}</div>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-3">
            <div className={typography('eyebrow')}>
              En curs / espera
            </div>
            <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.active}</div>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-3">
            <div className={typography('eyebrow')}>
              Pendents validar
            </div>
            <div className={`mt-2 ${typography('kpiValue')}`}>
              {ticketSummary.pendingValidation}
            </div>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-3">
            <div className={typography('eyebrow')}>
              Externalitzats
            </div>
            <div className={`mt-2 ${typography('kpiValue')}`}>
              {ticketSummary.externalized}
            </div>
          </div>
        </section>

        {!loading && groupedTickets.length === 0 && (
          <p className="text-sm text-gray-500">No hi ha tickets encara.</p>
        )}

        <TicketsList
          groupedTickets={groupedTickets}
          onSelect={(ticket) => {
            if (!canManageAllTickets) return
            markTicketSeen(ticket.id, 'maquinaria')
            setSelected(ticket)
          }}
          onDelete={handleDelete}
          canDelete={(ticket) =>
            ticket.createdById === userId ||
            ticketRole === 'admin' ||
            ticketRole === 'direccio' ||
            (ticketRole === 'cap' && isMaintenance)
          }
          formatDateTime={formatDateTime}
          statusBadgeClasses={displayStatusBadgeClasses}
          priorityBadgeClasses={priorityBadgeClasses}
          statusLabels={displayStatusLabels}
          priorityLabels={PRIORITY_LABELS}
        />

        {hasMoreTickets && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void fetchMoreTickets()}
              disabled={loadingMoreTickets}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMoreTickets ? 'Carregant...' : 'Carregar mes'}
            </button>
          </div>
        )}

        {showCreate && (
          <CreateTicketModal
            locations={locations}
            machines={machines}
            createPriority={createPriority}
            setCreatePriority={setCreatePriority}
            locationQuery={locationQuery}
            setLocationQuery={setLocationQuery}
            createLocation={createLocation}
            setCreateLocation={setCreateLocation}
            machineQuery={machineQuery}
            setMachineQuery={setMachineQuery}
            createMachine={createMachine}
            setCreateMachine={setCreateMachine}
            createDescription={createDescription}
            setCreateDescription={setCreateDescription}
            showLocationList={showLocationList}
            setShowLocationList={setShowLocationList}
            showMachineList={showMachineList}
            setShowMachineList={setShowMachineList}
            priorityLabels={PRIORITY_LABELS}
            onClose={() => setShowCreate(false)}
            onCreate={handleCreateTicket}
            createBusy={createBusy}
            onImageChange={handleImageChange}
            imageError={imageError}
            imagePreview={createImagePreview}
          />
        )}

        {selected && (
          <AssignTicketModal
            ticket={selected}
            assignBusy={assignBusy}
            assignDate={assignDate}
            setAssignDate={setAssignDate}
            assignStartTime={assignStartTime}
            setAssignStartTime={setAssignStartTime}
            assignDuration={assignDuration}
            setAssignDuration={setAssignDuration}
            workerCount={workerCount}
            setWorkerCount={setWorkerCount}
            maintenanceUsers={maintenanceUsers}
            availableIds={availableIds}
            availabilityLoading={availabilityLoading}
            furgonetes={furgonetes}
            locations={locations}
            machines={machines}
            detailsLocation={detailsLocation}
            setDetailsLocation={setDetailsLocation}
            detailsWorkLocation={detailsWorkLocation}
            setDetailsWorkLocation={setDetailsWorkLocation}
            detailsMachine={detailsMachine}
            setDetailsMachine={setDetailsMachine}
            detailsDescription={detailsDescription}
            setDetailsDescription={setDetailsDescription}
            detailsPriority={detailsPriority}
            setDetailsPriority={setDetailsPriority}
            canValidate={canValidate}
            canReopen={canReopen}
            canExternalize={canExternalize}
            externalizeBusy={externalizeBusy}
            onUpdateDetails={handleUpdateDetails}
            formatDateTime={formatDateTime}
            statusLabels={displayStatusLabels}
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            setSelected={setSelected}
            onAssign={handleAssign}
            onStatusChange={handleStatusChange}
            onAssignVehicle={handleAssignVehicle}
            onReopen={handleReopen}
            onExternalize={handleExternalize}
            onClose={closeSelectedTicket}
          />
        )}
      </div>
    </RoleGuard>
  )
}
