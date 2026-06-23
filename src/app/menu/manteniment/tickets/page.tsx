'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarCheck2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import MaintenanceToolbar from '../components/MaintenanceToolbar'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import {
  CorporateActiveFilterChip,
  CorporateFiltersActiveRow,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import {
  MAINTENANCE_TICKETS_DELETE_PERM,
  MAINTENANCE_TICKETS_INBOX_PERM,
  MAINTENANCE_TICKETS_MANAGE_PERM,
} from '@/lib/maintenanceTicketsPermissions'
import { canUserDeleteMaintenanceTicket } from '@/lib/maintenanceTicketDeletePolicy'
import {
  getCurrentMaintenanceWeekRange,
  type MaintenanceDateFilterMode,
} from '@/lib/maintenanceDateFilter'
import {
  isCuinaCentralDepartment,
  isMaintenanceTicketCreatorOnlyUser,
  isRestaurantOpsDepartment,
} from '@/lib/maintenanceTicketCreators'
import { OPS_CHANNEL_LOCATIONS } from '@/lib/opsMessagingChannels'
import { markTicketSeen } from '@/lib/maintenanceSeen'
import { formatDateTimeValue } from '@/lib/date-format'
import { typography } from '@/lib/typography'
import { useMaintenanceTickets } from './useMaintenanceTickets'
import type { Ticket, TicketPriority, TicketStatus } from './types'
import TicketsList from './components/TicketsList'
import CreateTicketModal from './components/CreateTicketModal'
import AssignTicketModal from './components/AssignTicketModal'
import ResolveTicketModal from './components/ResolveTicketModal'
import OpsWorkspacePanel from '@/components/messaging/OpsWorkspacePanel'
import { createMaintenanceOpsWorkspaceConfig } from '@/lib/messaging/maintenanceOpsWorkspace'
import MaintenanceNotificationsBell from '../components/MaintenanceNotificationsBell'

const opsRoomsFetcher = (url: string) => fetch(url).then((r) => r.json())

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
  resolut: 'Resolt',
  validat: 'Validat',
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

const statusBadgeClasses: Record<TicketStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-blue-100 text-blue-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  resolut: 'bg-teal-100 text-teal-800',
  validat: 'bg-purple-100 text-purple-800',
}

const priorityBadgeClasses: Record<TicketPriority, string> = {
  urgent: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-slate-100 text-slate-700',
  baixa: 'bg-blue-100 text-blue-700',
}

const KPI_STYLES = {
  inbox: 'border-amber-200 bg-amber-50/70',
  planned: 'border-sky-200 bg-sky-50/70',
  active: 'border-blue-200 bg-blue-50/70',
  validation: 'border-emerald-200 bg-emerald-50/70',
  external: 'border-violet-200 bg-violet-50/70',
} as const

const EXTERNAL_BUCKET_LABELS = {
  nou: 'Nous',
  assignat: 'Assignats',
  fet: 'Fets',
  externalitzat: 'Externalitzats',
} as const

const EXTERNAL_KPI_STYLES = {
  nou: KPI_STYLES.inbox,
  assignat: KPI_STYLES.active,
  fet: KPI_STYLES.validation,
  externalitzat: KPI_STYLES.external,
} as const

const MAINTENANCE_PLANNER_PATH = '/menu/manteniment/preventius/planificador'

export default function MaintenanceTicketsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setContent } = useFilters()
  const { isPathAllowed, hasAction } = useUiPermissions()
  const canViewPlanner = isPathAllowed(MAINTENANCE_PLANNER_PATH)
  const sessionUser = (session?.user || {}) as SessionUser
  const department = normalizeDept(sessionUser.department || '')
  const isOwnTicketsOnly = isMaintenanceTicketCreatorOnlyUser(sessionUser)
  const canManageInbox = hasAction(MAINTENANCE_TICKETS_INBOX_PERM)
  const canDeleteAnyTicket = hasAction(MAINTENANCE_TICKETS_DELETE_PERM)
  const canManageAllTickets = hasAction(MAINTENANCE_TICKETS_MANAGE_PERM)
  const canSeeMaintenanceBell = canManageAllTickets || canManageInbox
  const canManageInboxTickets = canManageInbox

  const formatDateTime = (value?: number | string | null) => formatDateTimeValue(value, '')
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null)
  const [resolveBusy, setResolveBusy] = useState(false)
  const [opsTicket, setOpsTicket] = useState<Ticket | null>(null)
  const maintenanceOpsConfig = useMemo(() => createMaintenanceOpsWorkspaceConfig(), [])

  const {
    userId,
    isExternalReporter,
    canValidate,
    canCapValidateTicket,
    canCreatorValidateTicket,
    canReopen,
    canExternalize,
    tickets,
    loading,
    error,
    hasMoreTickets,
    loadingMoreTickets,
    filters,
    setFilters,
    locations: catalogLocations,
    machines,
    showCreate,
    setShowCreate,
    openCreate,
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
    createWorkerName,
    setCreateWorkerName,
    needsWorkerName,
    createPriority,
    setCreatePriority,
    createAttachmentPreviews,
    createAttachmentCount,
    maxTicketAttachments,
    createBusy,
    attachmentCompressing,
    attachmentError,
    formError,
    canCreateTicket,
    handleAttachmentChange,
    removeAttachment,
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
    availableNameNorms,
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
    handleCreateTicket,
    handleAssign,
    handleStatusChange,
    handleReopen,
    handleAssignVehicle,
    handleUpdateDetails,
    handleExternalize,
    handleSendToPlanner,
    handleDirectResolution,
    handleCreatorValidate,
    handleDelete,
    fetchMoreTickets,
    groupedTickets,
    ticketSummary,
    externalReporterSummary,
  } = useMaintenanceTickets()

  const toggleExternalBucket = useCallback(
    (bucket: keyof typeof EXTERNAL_BUCKET_LABELS) => {
      setFilters((prev) => ({
        ...prev,
        ticketBucket: prev.ticketBucket === bucket ? '__all__' : bucket,
      }))
    },
    [setFilters]
  )

  const normalizeLocationKey = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()

  const createLocations = useMemo(() => {
    if (!isRestaurantOpsDepartment(department)) return catalogLocations
    const restaurantKeys = new Set(
      OPS_CHANNEL_LOCATIONS.filter((entry) => entry.source === 'restaurants').map((entry) =>
        normalizeLocationKey(entry.location)
      )
    )
    return catalogLocations.filter((loc) => restaurantKeys.has(normalizeLocationKey(loc)))
  }, [catalogLocations, department])

  useEffect(() => {
    setContent(
      <div key={`tickets-filters-${filters.dateMode ?? 'planned'}-${dateResetSignal}`} className="space-y-4 p-4">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={(filters.dateMode ?? 'planned') !== 'all'}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                dateMode: (e.target.checked ? 'planned' : 'all') as MaintenanceDateFilterMode,
              }))
            }
          />
          Aplicar filtre de dates
        </label>
        {isExternalReporter ? (
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Estat</span>
            <select
              value={filters.ticketBucket ?? '__all__'}
              onChange={(e) => setFilters((prev) => ({ ...prev, ticketBucket: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="__all__">Tots</option>
              <option value="nou">{EXTERNAL_BUCKET_LABELS.nou}</option>
              <option value="assignat">{EXTERNAL_BUCKET_LABELS.assignat}</option>
              <option value="fet">{EXTERNAL_BUCKET_LABELS.fet}</option>
              <option value="externalitzat">{EXTERNAL_BUCKET_LABELS.externalitzat}</option>
            </select>
          </label>
        ) : (
          <>
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
                <option value="resolut">{STATUS_LABELS.resolut}</option>
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
                {catalogLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              const { start, end } = getCurrentMaintenanceWeekRange()
              const next = {
                ...filters,
                start,
                end,
                status: '__all__',
                priority: '__all__',
                location: '__all__',
                ticketBucket: '__all__',
                dateMode: 'planned' as const,
              }
              setFilters(next)
              setDateResetSignal((current) => current + 1)
            }}
          />
        </div>
      </div>
    )

    return () => setContent(null)
  }, [canValidate, catalogLocations, dateResetSignal, filters, isExternalReporter, setContent, setFilters])

  const displayStatusLabels: Record<TicketStatus, string> = canValidate
    ? STATUS_LABELS
    : {
        ...STATUS_LABELS,
        validat: 'Validat',
      }

  const displayStatusBadgeClasses: Record<TicketStatus, string> = canValidate
    ? statusBadgeClasses
    : {
        ...statusBadgeClasses,
        validat: statusBadgeClasses.validat,
      }

  const queryTicketId = (searchParams?.get('ticketId') || '').trim()
  const queryOpenOps = searchParams?.get('ops') === '1'
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
    if (isOwnTicketsOnly) return
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
  }, [isOwnTicketsOnly, loading, queryTicketId, selected?.id, setSelected, tickets])

  const canResolveDirectly = useCallback(
    (ticket: Ticket) =>
      canManageInboxTickets &&
      !ticket.externalized &&
      (ticket.workflowStage || 'tickets_inbox') === 'tickets_inbox' &&
      ticket.status !== 'validat' &&
      ticket.status !== 'resolut',
    [canManageInboxTickets]
  )

  const canPlanifyDirectly = useCallback(
    (ticket: Ticket) =>
      canManageInboxTickets &&
      !ticket.externalized &&
      (ticket.workflowStage || 'tickets_inbox') === 'tickets_inbox' &&
      ticket.status !== 'validat' &&
      ticket.status !== 'resolut',
    [canManageInboxTickets]
  )

  const canDeleteTicket = useCallback(
    (ticket: Ticket) => canDeleteAnyTicket || canUserDeleteMaintenanceTicket(ticket, userId),
    [canDeleteAnyTicket, userId]
  )

  const canShowTicketOps = useCallback(
    (ticket: Ticket) => {
      if (canManageAllTickets) return true
      if (userId && ticket.createdById === userId) return true
      return false
    },
    [canManageAllTickets, userId]
  )

  const openTicketOps = useCallback((ticket: Ticket) => {
    setOpsTicket(ticket)
  }, [])

  useEffect(() => {
    if (!queryOpenOps || !queryTicketId) return
    const ticket =
      tickets.find((entry) => String(entry.id) === queryTicketId) ||
      (selected?.id === queryTicketId ? selected : null)
    if (!ticket || !canShowTicketOps(ticket)) return
    if (opsTicket?.id === ticket.id) return
    setOpsTicket(ticket)
  }, [canShowTicketOps, opsTicket?.id, queryOpenOps, queryTicketId, selected, tickets])

  const { data: selectedOpsData } = useSWR<{ rooms?: Array<{ unreadCount?: number }> }>(
    selected && canShowTicketOps(selected)
      ? `/api/maintenance/tickets/${encodeURIComponent(selected.id)}/ops/rooms`
      : null,
    opsRoomsFetcher
  )
  const selectedOpsUnread = Number(selectedOpsData?.rooms?.[0]?.unreadCount || 0)

  return (
      <MaintenancePermissionGate path="/menu/manteniment/tickets">
      <div className="flex w-full max-w-none flex-col gap-5 p-4 pb-8">
        <ModuleHeader
          title="Manteniment"
          subtitle="Tickets"
          mainHref="/menu/manteniment"
          actions={
            canViewPlanner || (canManageAllTickets || isOwnTicketsOnly) || canSeeMaintenanceBell ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canSeeMaintenanceBell ? <MaintenanceNotificationsBell /> : null}
                {canViewPlanner ? (
                  <Link
                    href={MAINTENANCE_PLANNER_PATH}
                    className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800 shadow-sm hover:bg-teal-50"
                  >
                    <CalendarCheck2 className="h-4 w-4" />
                    Planificador
                  </Link>
                ) : null}
                {canManageAllTickets || isOwnTicketsOnly ? (
                  <button
                    type="button"
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    onClick={() => openCreate()}
                  >
                    + Nou ticket
                  </button>
                ) : null}
              </div>
            ) : undefined
          }
        />

        {!isExternalReporter && isOwnTicketsOnly ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            {isCuinaCentralDepartment(department)
              ? 'Veus nomes els teus tickets. En crear-ne un de nou, es deriva al planificador de manteniment i aqui en pots seguir l evolucio.'
              : 'Veus nomes els teus tickets. Els nous entren a la safata de tickets de manteniment i aqui en pots seguir l evolucio.'}
          </div>
        ) : null}

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
            }
            onOpenFilters={() => undefined}
            bottomSlot={
              <CorporateFiltersActiveRow>
                {isExternalReporter && filters.ticketBucket && filters.ticketBucket !== '__all__' ? (
                  <CorporateActiveFilterChip>
                    {EXTERNAL_BUCKET_LABELS[filters.ticketBucket as keyof typeof EXTERNAL_BUCKET_LABELS]}
                  </CorporateActiveFilterChip>
                ) : null}
                {!isExternalReporter && filters.status && filters.status !== '__all__' ? (
                  <CorporateActiveFilterChip>
                    {STATUS_LABELS[filters.status as TicketStatus]}
                  </CorporateActiveFilterChip>
                ) : null}
                {!isExternalReporter && filters.priority && filters.priority !== '__all__' ? (
                  <CorporateActiveFilterChip>
                    {PRIORITY_LABELS[filters.priority as TicketPriority]}
                  </CorporateActiveFilterChip>
                ) : null}
                {!isExternalReporter && filters.location && filters.location !== '__all__' ? (
                  <CorporateActiveFilterChip>{filters.location}</CorporateActiveFilterChip>
                ) : null}
              </CorporateFiltersActiveRow>
            }
          />
        </CorporateFiltersShell>

        {loading && <p className="text-sm text-gray-500">Carregant...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {isExternalReporter ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(EXTERNAL_BUCKET_LABELS) as Array<keyof typeof EXTERNAL_BUCKET_LABELS>).map(
              (bucket) => {
                const active = filters.ticketBucket === bucket
                return (
                  <button
                    key={bucket}
                    type="button"
                    onClick={() => toggleExternalBucket(bucket)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      EXTERNAL_KPI_STYLES[bucket]
                    } ${active ? 'ring-2 ring-emerald-500 ring-offset-1' : 'hover:brightness-[0.98]'}`}
                  >
                    <div className={typography('eyebrow')}>{EXTERNAL_BUCKET_LABELS[bucket]}</div>
                    <div className={`mt-2 ${typography('kpiValue')}`}>
                      {externalReporterSummary[bucket]}
                    </div>
                  </button>
                )
              }
            )}
          </section>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className={`rounded-2xl border px-4 py-3 ${KPI_STYLES.inbox}`}>
              <div className={typography('eyebrow')}>Nous i reoberts</div>
              <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.inbox}</div>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${KPI_STYLES.planned}`}>
              <div className={typography('eyebrow')}>Planificats</div>
              <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.planned}</div>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${KPI_STYLES.active}`}>
              <div className={typography('eyebrow')}>En curs / espera</div>
              <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.active}</div>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${KPI_STYLES.validation}`}>
              <div className={typography('eyebrow')}>Pendents validar</div>
              <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.pendingValidation}</div>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${KPI_STYLES.external}`}>
              <div className={typography('eyebrow')}>Externalitzats</div>
              <div className={`mt-2 ${typography('kpiValue')}`}>{ticketSummary.externalized}</div>
            </div>
          </section>
        )}

        {!loading && groupedTickets.length === 0 && (
          <p className="text-sm text-gray-500">No hi ha tickets encara.</p>
        )}

        <TicketsList
          groupedTickets={groupedTickets}
          externalReporterView={isExternalReporter}
          onResolve={(ticket) => {
            if (!canResolveDirectly(ticket)) return
            markTicketSeen(ticket.id, 'maquinaria')
            setResolveTicket(ticket)
          }}
          onPlanify={(ticket) => {
            if (!canPlanifyDirectly(ticket)) return
            markTicketSeen(ticket.id, 'maquinaria')
            void handleSendToPlanner(ticket)
          }}
          canResolveDirectly={canResolveDirectly}
          canPlanifyDirectly={canPlanifyDirectly}
          onDelete={handleDelete}
          canDelete={canDeleteTicket}
          canCreatorValidate={canCreatorValidateTicket}
          onCreatorValidate={handleCreatorValidate}
          canShowOps={canShowTicketOps}
          onOpenOps={openTicketOps}
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
            locations={createLocations}
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
            createWorkerName={createWorkerName}
            setCreateWorkerName={setCreateWorkerName}
            needsWorkerName={needsWorkerName}
            showLocationList={showLocationList}
            setShowLocationList={setShowLocationList}
            showMachineList={showMachineList}
            setShowMachineList={setShowMachineList}
            priorityLabels={PRIORITY_LABELS}
            onClose={() => setShowCreate(false)}
            onCreate={handleCreateTicket}
            createBusy={createBusy}
            attachmentCompressing={attachmentCompressing}
            canCreate={canCreateTicket}
            onAttachmentChange={handleAttachmentChange}
            attachmentPreviews={createAttachmentPreviews}
            attachmentCount={createAttachmentCount}
            maxAttachments={maxTicketAttachments}
            onRemoveAttachment={removeAttachment}
            attachmentError={attachmentError}
            formError={formError}
          />
        )}

        {selected && !isOwnTicketsOnly && (
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
            availableNameNorms={availableNameNorms}
            availabilityLoading={availabilityLoading}
            furgonetes={furgonetes}
            locations={catalogLocations}
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
            canValidate={canManageInboxTickets && canValidate}
            canCapValidate={canManageInboxTickets ? canCapValidateTicket : undefined}
            onCapValidate={
              canManageInboxTickets
                ? (ticket, meta) => void handleStatusChange(ticket, 'validat', meta)
                : undefined
            }
            canReopen={canManageInboxTickets && canReopen}
            canExternalize={canManageInboxTickets && canExternalize}
            externalizeBusy={externalizeBusy}
            onUpdateDetails={canManageInboxTickets ? handleUpdateDetails : async () => undefined}
            formatDateTime={formatDateTime}
            statusLabels={displayStatusLabels}
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            setSelected={setSelected}
            onAssign={canManageInboxTickets ? handleAssign : async () => undefined}
            onStatusChange={canManageInboxTickets ? handleStatusChange : async () => undefined}
            onAssignVehicle={canManageInboxTickets ? handleAssignVehicle : async () => undefined}
            onReopen={canManageInboxTickets ? handleReopen : async () => undefined}
            onExternalize={canManageInboxTickets ? handleExternalize : async () => undefined}
            canResolveInCurrentModule={
              canManageInboxTickets && (selected.workflowStage || 'tickets_inbox') === 'tickets_inbox'
            }
            resolveArea="administracio"
            onResolveTicket={canManageInboxTickets ? handleDirectResolution : undefined}
            onSendToPlanner={canManageInboxTickets ? handleSendToPlanner : undefined}
            showOpsButton={canShowTicketOps(selected)}
            opsUnreadCount={selectedOpsUnread}
            onOpenOps={() => openTicketOps(selected)}
            onClose={closeSelectedTicket}
          />
        )}

        {opsTicket ? (
          <OpsWorkspacePanel
            open
            initialRoomId={opsTicket.id}
            config={maintenanceOpsConfig}
            onOpenChange={(open) => {
              if (!open) setOpsTicket(null)
            }}
          />
        ) : null}

        {resolveTicket && (
          <ResolveTicketModal
            ticket={resolveTicket}
            busy={resolveBusy}
            onClose={() => setResolveTicket(null)}
            onSubmit={async ({ category, note, completionImages }) => {
              try {
                setResolveBusy(true)
                await handleDirectResolution(resolveTicket, {
                  area: 'administracio',
                  category,
                  note,
                  completionImages,
                })
                setResolveTicket(null)
              } finally {
                setResolveBusy(false)
              }
            }}
          />
        )}
      </div>
      </MaintenancePermissionGate>
  )
}
