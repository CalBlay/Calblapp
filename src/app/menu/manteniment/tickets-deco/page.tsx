'use client'

import { RoleGuard } from '@/lib/withRoleGuard'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar from '@/components/layout/FiltersBar'
import TicketsList from '../tickets/components/TicketsList'
import CreateTicketModal from '../tickets/components/CreateTicketModal'
import AssignTicketModal from '../tickets/components/AssignTicketModal'
import type { TicketPriority, TicketStatus, TicketType } from '../tickets/types'
import { useMaintenanceTickets } from '../tickets/useMaintenanceTickets'
import { markTicketSeen } from '@/lib/maintenanceSeen'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'
import { useEffect, useMemo } from 'react'

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

const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  maquinaria: 'Maquinària',
  deco: 'Deco',
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

export default function MaintenanceTicketsDecoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const departmentRaw = (session?.user as any)?.department || ''
  const userRole = normalizeRole((session?.user as any)?.role || '')
  const department = useMemo(
    () =>
      (departmentRaw || '')
        .toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim(),
    [departmentRaw]
  )
  const isDecorations =
    department === 'decoracio' ||
    department === 'decoracions' ||
    department === 'decoracion'
  const hasAccess =
    userRole === 'admin' ||
    userRole === 'direccio' ||
    (userRole === 'cap' && isDecorations)

  useEffect(() => {
    if (status === 'loading') return
    if (!hasAccess) router.replace('/menu')
  }, [hasAccess, router, status])

  if (!hasAccess && status !== 'loading') return null

  const {
    role: ticketRole,
    userId,
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
    createTicketType,
    setCreateTicketType,
    createImagePreview,
    createBusy,
    imageError,
    selected,
    setSelected,
    assignBusy,
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
    handleAssignVehicle,
    handleUpdateDetails,
    handleDelete,
    fetchMoreTickets,
    groupedTickets,
  } = useMaintenanceTickets({ ticketType: 'deco' })

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="space-y-5 px-4 pb-8">
        <ModuleHeader
          title="Deco"
          mainHref="/menu/deco"
          actions={
            <button
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-full"
              onClick={() => setShowCreate(true)}
            >
              + Nou ticket
            </button>
          }
        />

        <FiltersBar
          filters={filters}
          setFilters={(f) => setFilters((prev) => ({ ...prev, ...f }))}
          hiddenFilters={['location']}
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
            { value: 'validat', label: STATUS_LABELS.validat },
          ]}
          priorityLabel="Importància"
          priorityOptions={[
            { value: '__all__', label: 'Totes' },
            { value: 'urgent', label: PRIORITY_LABELS.urgent },
            { value: 'alta', label: PRIORITY_LABELS.alta },
            { value: 'normal', label: PRIORITY_LABELS.normal },
            { value: 'baixa', label: PRIORITY_LABELS.baixa },
          ]}
        />

        {loading && <p className="text-sm text-gray-500">Carregant…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && groupedTickets.length === 0 && (
          <p className="text-sm text-gray-500">No hi ha tickets encara.</p>
        )}

        <TicketsList
          groupedTickets={groupedTickets}
          onSelect={(ticket) => {
            markTicketSeen(ticket.id, 'deco')
            setSelected(ticket)
          }}
          onDelete={handleDelete}
          canDelete={(ticket) =>
            ticket.createdById === userId ||
            ticketRole === 'admin' ||
            (ticketRole === 'cap' && isDecorations)
          }
          formatDateTime={formatDateTime}
          statusBadgeClasses={statusBadgeClasses}
          priorityBadgeClasses={priorityBadgeClasses}
          statusLabels={STATUS_LABELS}
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
            createTicketType={createTicketType}
            setCreateTicketType={setCreateTicketType}
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
            ticketTypeLabels={TICKET_TYPE_LABELS}
            showTicketTypeSelector={false}
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
            onUpdateDetails={handleUpdateDetails}
            formatDateTime={formatDateTime}
            statusLabels={STATUS_LABELS}
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            setSelected={setSelected}
            onAssign={handleAssign}
            onAssignVehicle={handleAssignVehicle}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </RoleGuard>
  )
}
