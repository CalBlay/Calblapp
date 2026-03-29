import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { formatDateOnly, formatDateTimeValue, formatTimeValue } from '@/lib/date-format'
import { useAvailableVehicles } from '@/hooks/logistics/useAvailableVehicles'
import { typography } from '@/lib/typography'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'
import { optimizeUploadFile } from '@/lib/file-optimization'
import type {
  MachineItem,
  Ticket,
  TicketPriority,
  TicketStatus,
  TransportItem,
  UserItem,
} from '../types'
import AssignTicketModalHeader from './assign-ticket-modal/AssignTicketModalHeader'
import AssignTicketSummary from './assign-ticket-modal/AssignTicketSummary'
import AssignTicketContextSection from './assign-ticket-modal/AssignTicketContextSection'
import AssignTicketPlanningSection from './assign-ticket-modal/AssignTicketPlanningSection'
import {
  buildEventMeta,
  buildSupplierMessage,
  buildSupplierSubject,
  formatDateInput,
  getSourceText,
} from './assign-ticket-modal/helpers'

type SupplierOption = {
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  active?: boolean
}

type Props = {
  ticket: Ticket
  assignBusy: boolean
  externalizeBusy: boolean
  assignDate: string
  setAssignDate: (value: string) => void
  assignStartTime: string
  setAssignStartTime: (value: string) => void
  assignDuration: string
  setAssignDuration: (value: string) => void
  workerCount: number
  setWorkerCount: (value: number) => void
  maintenanceUsers: UserItem[]
  availableIds: string[]
  availabilityLoading: boolean
  furgonetes: TransportItem[]
  locations: string[]
  machines: MachineItem[]
  detailsLocation: string
  setDetailsLocation: (value: string) => void
  detailsWorkLocation: string
  setDetailsWorkLocation: (value: string) => void
  detailsMachine: string
  setDetailsMachine: (value: string) => void
  detailsDescription: string
  setDetailsDescription: (value: string) => void
  detailsPriority: TicketPriority
  setDetailsPriority: (value: TicketPriority) => void
  canValidate: boolean
  canReopen: boolean
  canExternalize: boolean
  onUpdateDetails: () => void | Promise<void>
  formatDateTime: (value?: number | string | null) => string
  statusLabels: Record<TicketStatus, string>
  showHistory: boolean
  setShowHistory: (value: boolean | ((prev: boolean) => boolean)) => void
  setSelected: Dispatch<SetStateAction<Ticket | null>>
  onAssign: (ticket: Ticket, ids: string[], names: string[]) => void
  onStatusChange: (
    ticket: Ticket,
    status: TicketStatus,
    meta?: { supplierResolvedAt?: number | null; note?: string | null }
  ) => void
  onAssignVehicle: (
    ticket: Ticket,
    needsVehicle: boolean,
    vehicleType: string | null,
    plate: string | null
  ) => void
  onReopen: (ticket: Ticket) => void
  onExternalize: (
    ticket: Ticket,
    payload: {
      supplierName: string
      supplierEmail: string
      subject: string
      message: string
      externalReference?: string | null
      attachments?: Array<{
        name: string
        path: string
        contentType?: string | null
      }>
    }
  ) => Promise<void>
  onClose: () => void
}

export default function AssignTicketModal({
  ticket,
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
  maintenanceUsers,
  availableIds,
  availabilityLoading,
  furgonetes,
  locations,
  machines,
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
  canValidate,
  canReopen,
  canExternalize,
  onUpdateDetails,
  formatDateTime,
  statusLabels,
  showHistory,
  setShowHistory,
  setSelected,
  onAssign,
  onStatusChange,
  onAssignVehicle,
  onReopen,
  onExternalize,
  onClose,
}: Props) {
  const isDeco = ticket.ticketType === 'deco'
  const isValidated = ticket.status === 'validat' || ticket.status === 'resolut'
  const isPlanningStage = ticket.status === 'nou' || ticket.status === 'no_fet'
  const isAssignedStage = ticket.status === 'assignat'
  const machineLabel = isDeco ? 'Material' : 'Maquinaria'
  const machinePlaceholder = isDeco ? 'Selecciona material' : 'Selecciona maquinaria'
  const createdDateLabel = formatDateOnly(ticket.createdAt, '-')
  const createdFullLabel = formatDateTimeValue(ticket.createdAt, '-')
  const externalHistory = Array.isArray(ticket.externalizationHistory)
    ? [...ticket.externalizationHistory].sort((a, b) => (a.at || 0) - (b.at || 0))
    : []
  const latestExternal = externalHistory.length > 0 ? externalHistory[externalHistory.length - 1] : null
  const hasInternalAssignees = (ticket.assignedToIds?.length || 0) > 0
  const isExternallyManaged = Boolean(ticket.externalized || ticket.supplierEmail || ticket.supplierName)
  const providerBlockedByInternal = hasInternalAssignees && !isExternallyManaged
  const planningBlockedByProvider = isExternallyManaged
  const headerTitle = String(ticket.operatorTitle || ticket.description || ticket.machine || ticket.location || 'Ticket').trim()
  const originLocation = String(ticket.sourceEventLocation || ticket.location || detailsLocation || '').trim()
  const headerMeta = [ticket.ticketCode || ticket.incidentNumber || 'TIC', originLocation]
    .filter(Boolean)
    .join(' - ')
  const eventMeta = buildEventMeta(ticket.sourceEventTitle, ticket.sourceEventDate)
  const savedPlanningLabel = ticket.plannedStart
    ? [
        formatDateOnly(ticket.plannedStart),
        formatTimeValue(ticket.plannedStart, ''),
        ticket.plannedEnd ? formatTimeValue(ticket.plannedEnd, '') : '',
      ]
        .filter(Boolean)
        .join(' - ')
    : ''
  const machineOptions = useMemo(
    () =>
      Array.from(new Set(machines.map((machine) => String(machine.label || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [machines]
  )
  const detailsDirty =
    (!String(ticket.location || '').trim() &&
      detailsLocation.trim() !== String(ticket.location || '').trim()) ||
    detailsWorkLocation.trim() !== String(ticket.workLocation || '').trim() ||
    detailsMachine.trim() !== String(ticket.machine || '').trim() ||
    detailsDescription.trim() !== String(ticket.operatorTitle || '').trim() ||
    detailsPriority !== (ticket.priority || 'normal')

  const [supplierName, setSupplierName] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [externalReference, setExternalReference] = useState('')
  const [supplierSubject, setSupplierSubject] = useState('')
  const [supplierMessage, setSupplierMessage] = useState('')
  const [supplierResolvedDate, setSupplierResolvedDate] = useState('')
  const [emailAttachments, setEmailAttachments] = useState<File[]>([])
  const [emailAttachmentError, setEmailAttachmentError] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false)
  const [createSupplierBusy, setCreateSupplierBusy] = useState(false)
  const [machinePickerOpen, setMachinePickerOpen] = useState(false)
  const [machineQuery, setMachineQuery] = useState('')
  const [ticketInfoOpen, setTicketInfoOpen] = useState(true)
  const [jobDetailsOpen, setJobDetailsOpen] = useState(true)
  const [planningOpen, setPlanningOpen] = useState(true)
  const [providerOpen, setProviderOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>(
    String(ticket.vehicleType || '').trim()
  )

  const planningWindow = useMemo(() => {
    if (!assignDate || !assignStartTime || !assignDuration) return null
    const start = new Date(`${assignDate}T${assignStartTime}:00`)
    if (Number.isNaN(start.getTime())) return null
    const parts = assignDuration.trim().split(':')
    const hours = Number(parts[0] || 0)
    const mins = Number(parts[1] || 0)
    const minutes = Math.max(1, hours * 60 + mins)
    const end = new Date(start.getTime() + minutes * 60000)
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
      start.getDate()
    ).padStart(2, '0')}`
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
      end.getDate()
    ).padStart(2, '0')}`
    const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
    return { startDate, endDate, startTime, endTime }
  }, [assignDate, assignDuration, assignStartTime])

  const { vehicles: availableVehicles } = useAvailableVehicles({
    startDate: planningWindow?.startDate,
    endDate: planningWindow?.endDate,
    startTime: planningWindow?.startTime,
    endTime: planningWindow?.endTime,
    department: 'manteniment',
    enabled: Boolean(planningWindow && !isValidated),
  })

  const filteredMachineOptions = useMemo(() => {
    const query = machineQuery.trim().toLowerCase()
    if (!query) return machineOptions
    return machineOptions.filter((option) => option.toLowerCase().includes(query))
  }, [machineOptions, machineQuery])

  const vehicleTypeOptions = useMemo(
    () => [
      { value: 'furgonetaManteniment', label: TRANSPORT_TYPE_LABELS.furgonetaManteniment || 'Furgoneta manteniment' },
      { value: 'camioPPlataforma', label: TRANSPORT_TYPE_LABELS.camioPPlataforma || 'Camio P.Plataforma' },
    ],
    []
  )

  const availableVehicleOptions = useMemo(() => {
    const base = planningWindow ? availableVehicles.filter((vehicle) => vehicle.available) : furgonetes
    return base
      .filter((vehicle) => !selectedVehicleType || vehicle.type === selectedVehicleType)
      .sort((a, b) => String(a.plate || '').localeCompare(String(b.plate || '')))
  }, [availableVehicles, furgonetes, planningWindow, selectedVehicleType])
  const ticketImages = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(Array.isArray(ticket.imageUrls) ? ticket.imageUrls : []),
            ticket.imageUrl || '',
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )
      ).slice(0, 3),
    [ticket.imageUrl, ticket.imageUrls]
  )

  useEffect(() => {
    setSupplierName(String(ticket.supplierName || '').trim())
    setSupplierEmail(String(ticket.supplierEmail || '').trim())
    setExternalReference(String(ticket.externalReference || '').trim())
    setSupplierSubject(buildSupplierSubject(ticket))
    setSupplierMessage(buildSupplierMessage(ticket))
    setSupplierResolvedDate(
      formatDateInput(ticket.supplierResolvedAt || ticket.externalSentAt || Date.now())
    )
    setEmailAttachments([])
    setEmailAttachmentError('')
    setProviderOpen(false)
    setCreateSupplierOpen(false)
  }, [
    ticket.id,
    ticket.location,
    ticket.machine,
    ticket.description,
    ticket.operatorTitle,
    ticket.ticketCode,
    ticket.incidentNumber,
    ticket.supplierName,
    ticket.supplierEmail,
    ticket.externalReference,
  ])

  useEffect(() => {
    if (providerBlockedByInternal && providerOpen) {
      setProviderOpen(false)
    }
  }, [providerBlockedByInternal, providerOpen])

  useEffect(() => {
    const normalizedTicketType = String(ticket.vehicleType || '').trim()
    if (normalizedTicketType) {
      setSelectedVehicleType(normalizedTicketType)
      return
    }
    if (!ticket.vehiclePlate) {
      setSelectedVehicleType('')
      return
    }
    const matchedVehicle = furgonetes.find((vehicle) => vehicle.plate === ticket.vehiclePlate)
    setSelectedVehicleType(String(matchedVehicle?.type || '').trim())
  }, [furgonetes, ticket.vehiclePlate, ticket.vehicleType])

  useEffect(() => {
    if (!providerOpen) return
    let cancelled = false
    const loadSuppliers = async () => {
      try {
        setSuppliersLoading(true)
        const res = await fetch('/api/maintenance/data/suppliers', { cache: 'no-store' })
        const json = res.ok ? await res.json() : { suppliers: [] }
        if (cancelled) return
        setSuppliers(
          Array.isArray(json?.suppliers)
            ? json.suppliers.filter((item: SupplierOption) => item?.active !== false)
            : []
        )
      } finally {
        if (!cancelled) setSuppliersLoading(false)
      }
    }
    void loadSuppliers()
    return () => {
      cancelled = true
    }
  }, [providerOpen])

  const externalizeLabel = useMemo(
    () => (externalHistory.length > 0 ? 'Reenviar a proveidor' : 'Enviar a proveidor'),
    [externalHistory.length]
  )

  const selectedSupplierId = useMemo(() => {
    const match = suppliers.find(
      (item) =>
        item.name?.trim().toLowerCase() === supplierName.trim().toLowerCase() &&
        item.email?.trim().toLowerCase() === supplierEmail.trim().toLowerCase()
    )
    return match?.id || ''
  }, [supplierEmail, supplierName, suppliers])

  const addEmailAttachment = async (file: File | null) => {
    if (!file) return
    const optimizedFile = await optimizeUploadFile(file, 5 * 1024 * 1024)
    if (optimizedFile.size > 5 * 1024 * 1024) {
      setEmailAttachmentError('Cada adjunt ha de pesar com a maxim 5MB.')
      return
    }
    setEmailAttachmentError('')
    setEmailAttachments((prev) => [...prev, optimizedFile])
  }

  const removeEmailAttachment = (index: number) => {
    setEmailAttachments((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  const uploadEmailAttachments = async () => {
    const uploaded: Array<{ name: string; path: string; contentType?: string | null }> = []
    for (const file of emailAttachments) {
      const form = new FormData()
      form.append('file', file)
      form.append('ticketId', ticket.id)
      const res = await fetch('/api/maintenance/upload-email-attachment', {
        method: 'POST',
        body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'No s ha pogut pujar un adjunt')
      }
      uploaded.push({
        name: String(json?.name || file.name || 'adjunt').trim(),
        path: String(json?.path || '').trim(),
        contentType: String(json?.contentType || file.type || 'application/octet-stream').trim(),
      })
    }
    return uploaded
  }

  const selectSupplier = (supplier: SupplierOption) => {
    setSupplierName(String(supplier.name || '').trim())
    setSupplierEmail(String(supplier.email || '').trim())
    setCreateSupplierOpen(false)
  }

  const createSupplierFromForm = async () => {
    const cleanName = supplierName.trim()
    if (!cleanName) {
      setEmailAttachmentError('Cal informar el nom del proveidor nou.')
      return
    }
    try {
      setCreateSupplierBusy(true)
      setEmailAttachmentError('')
      const res = await fetch('/api/maintenance/data/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: supplierEmail.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'No s ha pogut crear el proveidor')
      }
      const newSupplier: SupplierOption = {
        id: String(json?.id || '').trim(),
        name: cleanName,
        email: supplierEmail.trim(),
        active: true,
      }
      setSuppliers((prev) => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)))
      setCreateSupplierOpen(false)
    } catch (error) {
      setEmailAttachmentError(
        error instanceof Error ? error.message : 'No s ha pogut crear el proveidor'
      )
    } finally {
      setCreateSupplierBusy(false)
    }
  }

  const handleCloseModal = async () => {
    if (detailsDirty && !isValidated) {
      try {
        await onUpdateDetails()
      } catch {
        // The wrapper already reports the save error.
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
      <div className="w-full max-w-3xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <AssignTicketModalHeader
          headerTitle={headerTitle}
          headerMeta={headerMeta}
          eventMeta={eventMeta}
          assignBusy={assignBusy}
          isAssignedStage={isAssignedStage}
          isValidated={isValidated}
          canReopen={canReopen}
          onAssign={() => onAssign(ticket, ticket.assignedToIds || [], ticket.assignedToNames || [])}
          onReopen={() => onReopen(ticket)}
        />

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5 md:px-6">
          <section className="space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => setTicketInfoOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className={typography('sectionTitle')}>Informacio del ticket</div>
              {ticketInfoOpen ? (
                <ChevronUp className="h-5 w-5 text-slate-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-500" />
              )}
            </button>

            {ticketInfoOpen ? (
              <>
                <AssignTicketSummary
                  isPlanningStage={isPlanningStage}
                  savedPlanningLabel={savedPlanningLabel}
                  createdDateLabel={createdDateLabel}
                  createdFullLabel={createdFullLabel}
                  createdByName={ticket.createdByName}
                  sourceText={getSourceText(ticket.source)}
                  assignedToNames={ticket.assignedToNames}
                />

                {ticketImages.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className={typography('sectionTitle')}>Imatges adjuntes</div>
                    <div className={`grid gap-3 ${ticketImages.length > 1 ? 'md:grid-cols-3' : ''}`}>
                      {ticketImages.map((imageUrl, index) => (
                        <a
                          key={`${imageUrl}-${index}`}
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-2xl border border-slate-200"
                        >
                          <img
                            src={imageUrl}
                            alt={`Imatge del ticket ${index + 1}`}
                            className="h-40 w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </section>

          {(ticket.externalized || ticket.status === 'fet') && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {ticket.externalized ? (
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
                    Proveidor
                  </span>
                ) : null}
                {ticket.externalized ? (
                  <span className="text-sm text-slate-600">
                    {ticket.supplierName || ticket.supplierEmail || 'Sense proveidor'}
                  </span>
                ) : null}
              </div>

              {ticket.externalized && ticket.status === 'espera' && canValidate ? (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm text-gray-700">
                    Data resolucio proveidor
                    <input
                      type="date"
                      className="mt-2 h-12 rounded-2xl border bg-white px-4 text-base"
                      value={supplierResolvedDate}
                      onChange={(e) => setSupplierResolvedDate(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onStatusChange(ticket, 'fet', {
                        supplierResolvedAt: supplierResolvedDate
                          ? new Date(`${supplierResolvedDate}T12:00:00`).getTime()
                          : Date.now(),
                        note: 'Resolt per proveidor',
                      })
                    }
                    className="min-h-[44px] rounded-full border border-emerald-300 px-4 text-sm font-semibold text-emerald-700"
                  >
                    Marcar fet
                  </button>
                </div>
              ) : null}

              {ticket.status === 'fet' && canValidate ? (
                <div className="flex flex-wrap items-center gap-3">
                  {ticket.externalized ? (
                    <div className="text-sm text-slate-600">
                      Resolucio proveidor: {formatDateTime(ticket.supplierResolvedAt)}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onStatusChange(ticket, 'validat')}
                    className="min-h-[44px] rounded-full border border-violet-300 px-4 text-sm font-semibold text-violet-700"
                  >
                    Validar
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <section className="space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => setJobDetailsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className={typography('sectionTitle')}>Dades de la feina</div>
              {jobDetailsOpen ? (
                <ChevronUp className="h-5 w-5 text-slate-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-500" />
              )}
            </button>

            {jobDetailsOpen ? (
              <>
                {(ticket.source === 'whatsblapp' || ticket.source === 'incidencia' || isPlanningStage) &&
                  isPlanningStage && (
                    <AssignTicketContextSection
                      showOriginLocationField={!String(ticket.location || ticket.sourceEventLocation || '').trim()}
                      locations={locations}
                      detailsLocation={detailsLocation}
                      setDetailsLocation={setDetailsLocation}
                      machineLabel={machineLabel}
                      machinePlaceholder={machinePlaceholder}
                      machinePickerOpen={machinePickerOpen}
                      setMachinePickerOpen={setMachinePickerOpen}
                      machineQuery={machineQuery}
                      setMachineQuery={setMachineQuery}
                      filteredMachineOptions={filteredMachineOptions}
                      detailsMachine={detailsMachine}
                      setDetailsMachine={setDetailsMachine}
                      detailsDescription={detailsDescription}
                      setDetailsDescription={setDetailsDescription}
                      detailsWorkLocation={detailsWorkLocation}
                      setDetailsWorkLocation={setDetailsWorkLocation}
                      detailsPriority={detailsPriority}
                      setDetailsPriority={setDetailsPriority}
                      isDeco={isDeco}
                      isValidated={isValidated}
                    />
                  )}

                {isAssignedStage && (
                  <div className="space-y-4">
                    <div className={typography('sectionTitle')}>Feina planificada</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className={typography('eyebrow')}>Ubicacio</div>
                        <div className={`mt-2 ${typography('bodyMd')}`}>{ticket.location || 'Sense ubicacio'}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className={typography('eyebrow')}>{machineLabel}</div>
                        <div className={`mt-2 ${typography('bodyMd')}`}>{ticket.machine || 'Sense assignar'}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className={typography('eyebrow')}>Origen</div>
                        <div className={`mt-2 ${typography('bodyMd')}`}>{getSourceText(ticket.source)}</div>
                      </div>
                    </div>
                  </div>
                )}

              </>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => !planningBlockedByProvider && setPlanningOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
              disabled={planningBlockedByProvider}
            >
              <div className="min-w-0">
                <div className={typography('sectionTitle')}>Planificar i assignar</div>
                {planningBlockedByProvider ? (
                  <div className="mt-1 text-xs text-slate-500">
                    El ticket esta externalitzat. Cal gestionar-lo des del bloc de proveidor.
                  </div>
                ) : null}
              </div>
              {planningOpen && !planningBlockedByProvider ? (
                <ChevronUp className="h-5 w-5 text-slate-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-500" />
              )}
            </button>

            {planningOpen ? (
              <AssignTicketPlanningSection
                isAssignedStage={isAssignedStage}
                isValidated={isValidated || planningBlockedByProvider}
                assignDate={assignDate}
                setAssignDate={setAssignDate}
                assignStartTime={assignStartTime}
                setAssignStartTime={setAssignStartTime}
                assignDuration={assignDuration}
                setAssignDuration={setAssignDuration}
                workerCount={workerCount}
                setWorkerCount={setWorkerCount}
                availabilityLoading={availabilityLoading}
                hasAvailabilityContext={Boolean(assignDate && assignStartTime && assignDuration)}
                maintenanceUsers={maintenanceUsers}
                availableIds={availableIds}
                ticket={ticket}
                setSelected={setSelected}
                selectedVehicleType={selectedVehicleType}
                setSelectedVehicleType={setSelectedVehicleType}
                vehicleTypeOptions={vehicleTypeOptions}
                availableVehicleOptions={availableVehicleOptions}
                onAssignVehicle={onAssignVehicle}
                formatDateTime={formatDateTime}
              />
            ) : null}
          </section>

          {canExternalize && (
            <section className="space-y-4 rounded-2xl border p-4">
              <button
                type="button"
                onClick={() => !providerBlockedByInternal && setProviderOpen((prev) => !prev)}
                disabled={providerBlockedByInternal}
                className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0">
                  <div className={typography('sectionTitle')}>Enviar a proveidor</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {providerBlockedByInternal
                      ? 'Treure els operaris assignats abans d externalitzar el ticket.'
                      : 'Deriva el ticket per correu i el deixa en espera.'}
                  </div>
                  {latestExternal && (
                    <div className="mt-2 text-xs text-slate-500">
                      Ultim enviament: {latestExternal.supplierName || ticket.supplierName || 'Proveidor'} -{' '}
                      {formatDateTime(latestExternal.at || ticket.externalSentAt)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isValidated && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Reobrir abans d externalitzar
                    </span>
                  )}
                  {providerOpen ? (
                    <ChevronUp className="h-5 w-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-500" />
                  )}
                </div>
              </button>

              {providerOpen && latestExternal && (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-semibold text-slate-800">
                    Ultim enviament: {latestExternal.supplierName || ticket.supplierName || 'Proveidor'}
                  </div>
                  <div className="mt-1">
                    {latestExternal.supplierEmail || ticket.supplierEmail || 'Sense email'} -{' '}
                    {formatDateTime(latestExternal.at || ticket.externalSentAt)}
                  </div>
                  {(latestExternal.reference || ticket.externalReference) && (
                    <div className="mt-1">
                      Referencia: {latestExternal.reference || ticket.externalReference}
                    </div>
                  )}
                </div>
              )}

              {providerOpen && (
                <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Proveidor guardat</div>
                  <button
                    type="button"
                    onClick={() => setCreateSupplierOpen((prev) => !prev)}
                    disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 text-sm text-slate-700 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {createSupplierOpen ? 'Tancar nou proveidor' : 'Nou proveidor'}
                  </button>
                </div>

                <select
                  className="min-h-[48px] w-full rounded-2xl border bg-white px-4 text-sm disabled:opacity-60"
                  value={selectedSupplierId}
                  disabled={isValidated || externalizeBusy || suppliersLoading || providerBlockedByInternal}
                  onChange={(e) => {
                    const nextId = String(e.target.value || '')
                    const nextSupplier = suppliers.find((supplier) => supplier.id === nextId)
                    if (nextSupplier) {
                      selectSupplier(nextSupplier)
                      return
                    }
                    setSupplierName('')
                    setSupplierEmail('')
                  }}
                >
                  <option value="">
                    {suppliersLoading ? 'Carregant proveidors...' : 'Selecciona proveidor'}
                  </option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {[supplier.name, supplier.email].filter(Boolean).join(' - ')}
                    </option>
                  ))}
                </select>

                {createSupplierOpen && (
                  <div className="grid gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
                    <input
                      type="text"
                      className="h-12 rounded-2xl border bg-white px-4 text-base"
                      value={supplierName}
                      disabled={isValidated || externalizeBusy || createSupplierBusy}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Nom proveidor"
                    />
                    <input
                      type="email"
                      className="h-12 rounded-2xl border bg-white px-4 text-base"
                      value={supplierEmail}
                      disabled={isValidated || externalizeBusy || createSupplierBusy}
                      onChange={(e) => setSupplierEmail(e.target.value)}
                      placeholder="Email proveidor"
                    />
                    <button
                      type="button"
                      onClick={() => void createSupplierFromForm()}
                      disabled={isValidated || externalizeBusy || createSupplierBusy}
                      className="min-h-[48px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {createSupplierBusy ? 'Creant...' : 'Guardar'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm text-gray-700">
                  Nom proveidor
                  <input
                    type="text"
                    className="mt-2 h-12 w-full rounded-2xl border bg-white px-4 text-base"
                    value={supplierName}
                    disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Email proveidor
                  <input
                    type="email"
                    className="mt-2 h-12 w-full rounded-2xl border bg-white px-4 text-base"
                    value={supplierEmail}
                    disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm text-gray-700">
                  Referencia externa
                  <input
                    type="text"
                    className="mt-2 h-12 w-full rounded-2xl border bg-white px-4 text-base"
                    value={externalReference}
                    disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                    onChange={(e) => setExternalReference(e.target.value)}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Assumpte
                  <input
                    type="text"
                    className="mt-2 h-12 w-full rounded-2xl border bg-white px-4 text-base"
                    value={supplierSubject}
                    disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                    onChange={(e) => setSupplierSubject(e.target.value)}
                  />
                </label>
              </div>

              <label className="block text-sm text-gray-700">
                Missatge
                <textarea
                  className="mt-2 min-h-[140px] w-full rounded-2xl border bg-white px-4 py-3 text-base"
                  value={supplierMessage}
                  disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                  onChange={(e) => setSupplierMessage(e.target.value)}
                />
              </label>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-gray-500">Adjunts per enviar</label>
                  <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                    Fitxer
                    <input
                      type="file"
                      className="hidden"
                      disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                      onChange={(e) => addEmailAttachment(e.target.files?.[0] || null)}
                    />
                  </label>
                  <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                    Foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                      onChange={(e) => addEmailAttachment(e.target.files?.[0] || null)}
                    />
                  </label>
                  {emailAttachmentError && (
                    <span className="text-sm text-red-600">{emailAttachmentError}</span>
                  )}
                </div>

                {ticket.imageUrl && (
                  <div className="text-xs text-slate-600">
                    La imatge adjunta del ticket tambe s enviara al proveidor.
                  </div>
                )}

                {emailAttachments.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    {emailAttachments.map((file, index) => {
                      return (
                        <div
                          key={`${file.name}-${file.size}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800">
                              {file.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {Math.max(1, Math.round(file.size / 1024))} KB
                            </div>
                          </div>
                          {file.type.startsWith('image/') ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                              Imatge
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                              Fitxer
                            </span>
                          )}
                          <button
                            type="button"
                            className="rounded-full border px-3 py-1 text-xs text-slate-600"
                            onClick={() => removeEmailAttachment(index)}
                          >
                            Treure
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isValidated || externalizeBusy || providerBlockedByInternal}
                  onClick={async () => {
                    try {
                      if (detailsDirty) {
                        await onUpdateDetails()
                      }
                      const attachments = await uploadEmailAttachments()
                      await onExternalize(ticket, {
                        supplierName: supplierName.trim(),
                        supplierEmail: supplierEmail.trim(),
                        subject: supplierSubject.trim(),
                        message: supplierMessage.trim(),
                        externalReference: externalReference.trim() || null,
                        attachments,
                      })
                      setEmailAttachments([])
                      setEmailAttachmentError('')
                      setProviderOpen(false)
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'No s ha pogut preparar l enviament'
                      setEmailAttachmentError(message)
                    }
                  }}
                  className="min-h-[44px] rounded-full bg-slate-900 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {externalizeBusy ? 'Enviant...' : externalizeLabel}
                </button>
              </div>
                </>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => {
                setHistoryOpen((prev) => !prev)
                setShowHistory((prev) => !prev)
              }}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className={typography('sectionTitle')}>Historial</div>
              {historyOpen ? (
                <ChevronUp className="h-5 w-5 text-slate-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-500" />
              )}
            </button>
            {historyOpen && showHistory && (
              <div className="space-y-2 rounded-2xl border p-4">
                {(ticket.statusHistory || []).map((item, index) => (
                  <div key={`status-${index}`} className="text-sm text-gray-500">
                    {statusLabels[item.status]} - {formatDateTime(item.at)} - {item.byName || ''}
                  </div>
                ))}
                {externalHistory.map((item, index) => (
                  <div key={`external-${index}`} className="text-sm text-slate-600">
                    Proveidor - {item.supplierName || item.supplierEmail || 'Sense destinatari'} -{' '}
                    {formatDateTime(item.at)} - {item.byName || ''}
                  </div>
                ))}
                {(!ticket.statusHistory || ticket.statusHistory.length === 0) &&
                  externalHistory.length === 0 && (
                    <div className="text-sm text-gray-400">Sense historial.</div>
                  )}
              </div>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={() => void handleCloseModal()}
            className="min-h-[48px] rounded-full border px-5 text-sm font-medium"
          >
            Tancar
          </button>
        </div>
      </div>
    </div>
  )
}
