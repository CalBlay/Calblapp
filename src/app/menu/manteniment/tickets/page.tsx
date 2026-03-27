'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { RoleGuard } from '@/lib/withRoleGuard'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar from '@/components/layout/FiltersBar'
import { normalizeRole } from '@/lib/roles'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { markTicketSeen } from '@/lib/maintenanceSeen'
import { useMaintenanceNewCount } from '@/hooks/useMaintenanceNewCount'
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

const formatDateTime = (value?: number | string | null) => {
  if (!value) return ''
  const date =
    typeof value === 'string'
      ? new Date(value)
      : typeof value === 'number'
      ? new Date(value)
      : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}

export default function MaintenanceTicketsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionUser = (session?.user || {}) as SessionUser
  const department = normalizeDept(sessionUser.department || '')
  const userRole = normalizeRole(sessionUser.role || '')
  const isMaintenance = department === 'manteniment'
  const isMaintenanceCap = userRole === 'cap' && isMaintenanceCapDepartment(department)
  const hasAccess =
    userRole === 'admin' ||
    userRole === 'direccio' ||
    isMaintenanceCap ||
    (userRole === 'treballador' && isMaintenance)

  const { count: newTicketsCount } = useMaintenanceNewCount()

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
  } = useMaintenanceTickets()

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
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-8">
        <ModuleHeader
          title="Manteniment"
          subtitle="Tickets"
          mainHref="/menu/manteniment"
          actions={
            ticketRole === 'admin' || ticketRole === 'direccio' || (ticketRole === 'cap' && isMaintenance) ? (
              <button
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={() => setShowCreate(true)}
              >
                + Nou ticket
              </button>
            ) : undefined
          }
        />

        <FiltersBar
          filters={filters}
          setFilters={(next) => setFilters((prev) => ({ ...prev, ...next }))}
          locations={locations}
          statusLabel="Estat"
          statusOptions={[
            { value: '__all__', label: 'Tots' },
            { value: 'nou', label: STATUS_LABELS.nou },
            { value: 'assignat', label: STATUS_LABELS.assignat },
            { value: 'en_curs', label: STATUS_LABELS.en_curs },
            { value: 'espera', label: STATUS_LABELS.espera },
            { value: 'fet', label: STATUS_LABELS.fet },
            { value: 'no_fet', label: STATUS_LABELS.no_fet },
            ...(canValidate ? [{ value: 'validat', label: STATUS_LABELS.validat }] : []),
          ]}
          priorityLabel="Importancia"
          priorityOptions={[
            { value: '__all__', label: 'Totes' },
            { value: 'urgent', label: PRIORITY_LABELS.urgent },
            { value: 'alta', label: PRIORITY_LABELS.alta },
            { value: 'normal', label: PRIORITY_LABELS.normal },
            { value: 'baixa', label: PRIORITY_LABELS.baixa },
          ]}
        />

        {loading && <p className="text-sm text-gray-500">Carregant...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
            <ClipboardList className="h-4 w-4 text-emerald-700" />
            <span className="font-semibold">Tickets de manteniment</span>
            {newTicketsCount > 0 ? (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                {newTicketsCount}
              </span>
            ) : null}
            <span className="text-xs text-slate-500">Nous pendents</span>
          </div>
        </section>

        {!loading && groupedTickets.length === 0 && (
          <p className="text-sm text-gray-500">No hi ha tickets encara.</p>
        )}

        <TicketsList
          groupedTickets={groupedTickets}
          onSelect={(ticket) => {
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
