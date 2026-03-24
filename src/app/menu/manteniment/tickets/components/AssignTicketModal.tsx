import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import type {
  MachineItem,
  Ticket,
  TicketPriority,
  TicketStatus,
  TransportItem,
  UserItem,
} from '../types'

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
  detailsMachine: string
  setDetailsMachine: (value: string) => void
  detailsDescription: string
  setDetailsDescription: (value: string) => void
  detailsPriority: TicketPriority
  setDetailsPriority: (value: TicketPriority) => void
  canValidate: boolean
  canReopen: boolean
  canExternalize: boolean
  onUpdateDetails: () => void
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
  onAssignVehicle: (ticket: Ticket, needsVehicle: boolean, plate: string | null) => void
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

function formatCreatedShort(value?: number | string | null) {
  if (!value) return ''
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

function buildSupplierSubject(ticket: Ticket) {
  const code = ticket.ticketCode || ticket.incidentNumber || 'TIC'
  const location = String(ticket.location || '').trim()
  return location
    ? `Ticket manteniment ${code} - ${location}`
    : `Ticket manteniment ${code}`
}

function buildSupplierMessage(ticket: Ticket) {
  const lines = [
    'Bon dia,',
    '',
    'Us preguem revisio i disponibilitat per aquesta incidencia.',
    '',
    'Gracies.',
  ]
  return lines.filter(Boolean).join('\n')
}

function formatDateInput(value?: number | string | null) {
  if (!value && value !== 0) return ''
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
  const machineLabel = isDeco ? 'Material' : 'Maquinaria'
  const machinePlaceholder = isDeco ? 'Selecciona material' : 'Selecciona maquinaria'
  const eventTitleShort = (ticket.sourceEventTitle || '')
    .split('/')
    .map((chunk) => chunk.trim())
    .filter(Boolean)[0]
  const createdLabel = formatCreatedShort(ticket.createdAt)
  const externalHistory = Array.isArray(ticket.externalizationHistory)
    ? [...ticket.externalizationHistory].sort((a, b) => (a.at || 0) - (b.at || 0))
    : []
  const latestExternal = externalHistory.length > 0 ? externalHistory[externalHistory.length - 1] : null

  const [supplierName, setSupplierName] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [externalReference, setExternalReference] = useState('')
  const [supplierSubject, setSupplierSubject] = useState('')
  const [supplierMessage, setSupplierMessage] = useState('')
  const [supplierResolvedDate, setSupplierResolvedDate] = useState('')
  const [emailAttachments, setEmailAttachments] = useState<File[]>([])
  const [emailAttachmentError, setEmailAttachmentError] = useState('')
  const [showExternalizeSection, setShowExternalizeSection] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false)
  const [createSupplierBusy, setCreateSupplierBusy] = useState(false)

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
    setShowExternalizeSection(false)
    setCreateSupplierOpen(false)
  }, [ticket.id, ticket.location, ticket.machine, ticket.description, ticket.ticketCode, ticket.incidentNumber, ticket.supplierName, ticket.supplierEmail, ticket.externalReference])

  useEffect(() => {
    if (!showExternalizeSection) return
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
  }, [showExternalizeSection])

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

  const addEmailAttachment = (file: File | null) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setEmailAttachmentError('Cada adjunt ha de pesar com a maxim 5MB.')
      return
    }
    setEmailAttachmentError('')
    setEmailAttachments((prev) => [...prev, file])
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
      <div className="w-full max-w-3xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold text-gray-900">{ticket.machine}</div>
              <div className="mt-1 text-sm text-gray-500">
                {ticket.ticketCode || ticket.incidentNumber || 'TIC'} · {ticket.location}
                {createdLabel ? ` · Creat: ${createdLabel}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAssign(ticket, ticket.assignedToIds || [], ticket.assignedToNames || [])}
                disabled={assignBusy || isValidated}
                className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assignBusy ? 'Assignant...' : 'Assignar'}
              </button>
              {isValidated && canReopen && (
                <button
                  type="button"
                  onClick={() => onReopen(ticket)}
                  className="min-h-[44px] rounded-full border border-amber-300 px-5 text-sm font-semibold text-amber-700"
                >
                  Reobrir
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 text-lg text-gray-500"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5 md:px-6">
          {ticket.imageUrl && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-800">Imatge adjunta</div>
              <a
                href={ticket.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-2xl border border-slate-200"
              >
                <img
                  src={ticket.imageUrl}
                  alt="Imatge del ticket"
                  className="max-h-72 w-full object-cover"
                />
              </a>
            </div>
          )}

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

          {(ticket.source === 'whatsblapp' || ticket.source === 'incidencia') &&
            ticket.status === 'nou' && (
              <div className="space-y-4 rounded-2xl border p-4">
                <div className="text-sm font-semibold text-gray-700">Revisio del ticket</div>
                {(ticket.sourceEventTitle || ticket.sourceEventCode || ticket.sourceEventDate) && (
                  <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="font-semibold text-slate-700">
                      {eventTitleShort || ticket.sourceEventTitle || 'Esdeveniment'}
                    </div>
                    <div>
                      {(ticket.sourceEventCode || '').trim()}
                      {ticket.sourceEventCode && ticket.sourceEventDate ? ' · ' : ''}
                      {(ticket.sourceEventDate || '').trim()}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="text-sm text-gray-700">
                    Ubicacio
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                      value={detailsLocation}
                      disabled={isValidated}
                      onChange={(e) => setDetailsLocation(e.target.value)}
                    >
                      <option value="">Selecciona ubicacio</option>
                      {locations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    {machineLabel}
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                      value={detailsMachine}
                      disabled={isValidated}
                      onChange={(e) => setDetailsMachine(e.target.value)}
                    >
                      <option value="">{machinePlaceholder}</option>
                      {machines.map((m) => (
                        <option key={`${m.code}-${m.name}`} value={m.label}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-sm text-gray-700">
                  Observacions
                  <textarea
                    className="mt-2 min-h-[120px] w-full rounded-2xl border bg-gray-50 px-4 py-3 text-base"
                    value={detailsDescription}
                    disabled={isValidated}
                    onChange={(e) => setDetailsDescription(e.target.value)}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500">Importancia</span>
                  {(['urgent', 'alta', 'normal', 'baixa'] as TicketPriority[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={isValidated}
                      onClick={() => setDetailsPriority(key)}
                      className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
                        detailsPriority === key
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-gray-200 bg-gray-100 text-gray-800'
                      }`}
                    >
                      {key === 'urgent'
                        ? 'Urgent'
                        : key === 'alta'
                          ? 'Alta'
                          : key === 'normal'
                            ? 'Normal'
                            : 'Baixa'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={onUpdateDetails}
                    disabled={isValidated}
                    className="min-h-[44px] rounded-full border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Guardar dades
                  </button>
                </div>
              </div>
            )}

          <div className="space-y-4 rounded-2xl border p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <label className="text-sm text-gray-700">
                Data
                <input
                  type="date"
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={assignDate}
                  disabled={isValidated}
                  onChange={(e) => setAssignDate(e.target.value)}
                />
              </label>

              <label className="text-sm text-gray-700">
                Hora
                <input
                  type="time"
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={assignStartTime}
                  disabled={isValidated}
                  onChange={(e) => setAssignStartTime(e.target.value)}
                />
              </label>

              <label className="text-sm text-gray-700">
                Hores estimades
                <input
                  type="time"
                  step={60}
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={assignDuration}
                  disabled={isValidated}
                  onChange={(e) => setAssignDuration(e.target.value)}
                />
              </label>

              <label className="text-sm text-gray-700">
                Treballadors
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={workerCount}
                  disabled={isValidated}
                  onChange={(e) => setWorkerCount(Number(e.target.value || 1))}
                />
              </label>

              <label className="text-sm text-gray-700">
                Furgoneta
                <select
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={ticket.vehiclePlate || ''}
                  disabled={isValidated}
                  onChange={(e) => onAssignVehicle(ticket, !!e.target.value, e.target.value || null)}
                >
                  <option value="">Sense assignar</option>
                  {furgonetes.map((t) => (
                    <option key={t.id} value={t.plate}>
                      {t.plate}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-500">
              {availabilityLoading && <span>Comprovant disponibilitat...</span>}
              {!availabilityLoading && assignDate && assignStartTime && (
                <span className="font-medium text-emerald-700">Nomes disponibles</span>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {maintenanceUsers.map((u) => {
                const checked = ticket.assignedToIds?.includes(u.id)
                const isAvailable = availableIds.length === 0 || availableIds.includes(u.id)
                return (
                  <label
                    key={u.id}
                    className={`flex min-h-[44px] items-center gap-3 rounded-full border px-4 py-2 text-sm ${
                      checked ? 'border-emerald-200 bg-emerald-100' : 'bg-white'
                    } ${!isAvailable ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!checked}
                      disabled={isValidated || !isAvailable}
                      onChange={(e) => {
                        const nextIds = new Set(ticket.assignedToIds || [])
                        if (e.target.checked) {
                          if (nextIds.size >= workerCount) {
                            if (workerCount === 1) {
                              nextIds.clear()
                            } else {
                              return
                            }
                          }
                          nextIds.add(u.id)
                        } else {
                          nextIds.delete(u.id)
                        }
                        const nextIdList = Array.from(nextIds)
                        const nextNames = maintenanceUsers
                          .filter((item) => nextIdList.includes(item.id))
                          .map((item) => item.name)
                        setSelected((prev) =>
                          prev
                            ? {
                                ...prev,
                                assignedToIds: nextIdList,
                                assignedToNames: nextNames,
                              }
                            : prev
                        )
                      }}
                    />
                    <span>{u.name}</span>
                  </label>
                )
              })}
            </div>

            {ticket.assignedAt && (
              <div className="text-sm text-gray-500">
                Assignat: {formatDateTime(ticket.assignedAt)} · {ticket.assignedByName || ''}
              </div>
            )}
          </div>

          {canExternalize && (
            <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <button
                type="button"
                onClick={() => setShowExternalizeSection((prev) => !prev)}
                className="flex min-h-[56px] w-full items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Enviar a proveidor</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Deriva el ticket per correu i el deixa en espera.
                  </div>
                  {latestExternal && (
                    <div className="mt-2 text-xs text-slate-500">
                      Ultim enviament: {latestExternal.supplierName || ticket.supplierName || 'Proveidor'} ·{' '}
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
                  {showExternalizeSection ? (
                    <ChevronUp className="h-5 w-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-500" />
                  )}
                </div>
              </button>

              {showExternalizeSection && latestExternal && (
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
                  <div className="font-semibold text-slate-800">
                    Ultim enviament: {latestExternal.supplierName || ticket.supplierName || 'Proveidor'}
                  </div>
                  <div className="mt-1">
                    {latestExternal.supplierEmail || ticket.supplierEmail || 'Sense email'} ·{' '}
                    {formatDateTime(latestExternal.at || ticket.externalSentAt)}
                  </div>
                  {(latestExternal.reference || ticket.externalReference) && (
                    <div className="mt-1">
                      Referencia: {latestExternal.reference || ticket.externalReference}
                    </div>
                  )}
                </div>
              )}

              {showExternalizeSection && (
                <>
              <div className="space-y-3 rounded-2xl border border-blue-100 bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Proveidor guardat</div>
                  <button
                    type="button"
                    onClick={() => setCreateSupplierOpen((prev) => !prev)}
                    disabled={isValidated || externalizeBusy}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 text-sm text-slate-700 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {createSupplierOpen ? 'Tancar nou proveidor' : 'Nou proveidor'}
                  </button>
                </div>

                <select
                  className="min-h-[48px] w-full rounded-2xl border bg-white px-4 text-sm disabled:opacity-60"
                  value={selectedSupplierId}
                  disabled={isValidated || externalizeBusy || suppliersLoading}
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
                      {[supplier.name, supplier.email].filter(Boolean).join(' · ')}
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
                    disabled={isValidated || externalizeBusy}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Email proveidor
                  <input
                    type="email"
                    className="mt-2 h-12 w-full rounded-2xl border bg-white px-4 text-base"
                    value={supplierEmail}
                    disabled={isValidated || externalizeBusy}
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
                    disabled={isValidated || externalizeBusy}
                    onChange={(e) => setExternalReference(e.target.value)}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Assumpte
                  <input
                    type="text"
                    className="mt-2 h-12 w-full rounded-2xl border bg-white px-4 text-base"
                    value={supplierSubject}
                    disabled={isValidated || externalizeBusy}
                    onChange={(e) => setSupplierSubject(e.target.value)}
                  />
                </label>
              </div>

              <label className="block text-sm text-gray-700">
                Missatge
                <textarea
                  className="mt-2 min-h-[140px] w-full rounded-2xl border bg-white px-4 py-3 text-base"
                  value={supplierMessage}
                  disabled={isValidated || externalizeBusy}
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
                      disabled={isValidated || externalizeBusy}
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
                      disabled={isValidated || externalizeBusy}
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
                  disabled={isValidated || externalizeBusy}
                  onClick={async () => {
                    try {
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
                      setShowExternalizeSection(false)
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
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="text-sm font-medium text-gray-600 underline"
            >
              Historic
            </button>
            {showHistory && (
              <div className="space-y-2 rounded-2xl border p-4">
                {(ticket.statusHistory || []).map((item, index) => (
                  <div key={`status-${index}`} className="text-sm text-gray-500">
                    {statusLabels[item.status]} · {formatDateTime(item.at)} · {item.byName || ''}
                  </div>
                ))}
                {externalHistory.map((item, index) => (
                  <div key={`external-${index}`} className="text-sm text-slate-600">
                    Proveidor · {item.supplierName || item.supplierEmail || 'Sense destinatari'} ·{' '}
                    {formatDateTime(item.at)} · {item.byName || ''}
                  </div>
                ))}
                {(!ticket.statusHistory || ticket.statusHistory.length === 0) &&
                  externalHistory.length === 0 && (
                    <div className="text-sm text-gray-400">Sense historial.</div>
                  )}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-full border px-5 text-sm font-medium"
          >
            Tancar
          </button>
        </div>
      </div>
    </div>
  )
}
