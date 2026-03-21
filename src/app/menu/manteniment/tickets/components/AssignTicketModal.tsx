import type { Dispatch, SetStateAction } from 'react'
import type {
  MachineItem,
  Ticket,
  TicketPriority,
  TicketStatus,
  TransportItem,
  UserItem,
} from '../types'

type Props = {
  ticket: Ticket
  assignBusy: boolean
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
  onUpdateDetails: () => void
  formatDateTime: (value?: number | string | null) => string
  statusLabels: Record<TicketStatus, string>
  showHistory: boolean
  setShowHistory: (value: boolean | ((prev: boolean) => boolean)) => void
  setSelected: Dispatch<SetStateAction<Ticket | null>>
  onAssign: (ticket: Ticket, ids: string[], names: string[]) => void
  onAssignVehicle: (ticket: Ticket, needsVehicle: boolean, plate: string | null) => void
  onClose: () => void
}

export default function AssignTicketModal({
  ticket,
  assignBusy,
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
  onUpdateDetails,
  formatDateTime,
  statusLabels,
  showHistory,
  setShowHistory,
  setSelected,
  onAssign,
  onAssignVehicle,
  onClose,
}: Props) {
  const isDeco = ticket.ticketType === 'deco'
  const machineLabel = isDeco ? 'Material' : 'Maquinaria'
  const machinePlaceholder = isDeco ? 'Selecciona material' : 'Selecciona maquinaria'
  const eventTitleShort = (ticket.sourceEventTitle || '')
    .split('/')
    .map((chunk) => chunk.trim())
    .filter(Boolean)[0]

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
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAssign(ticket, ticket.assignedToIds || [], ticket.assignedToNames || [])}
                disabled={assignBusy}
                className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white"
              >
                {assignBusy ? 'Assignant...' : 'Assignar'}
              </button>
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
                    onChange={(e) => setDetailsDescription(e.target.value)}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500">Importancia</span>
                  {(['urgent', 'alta', 'normal', 'baixa'] as TicketPriority[]).map((key) => (
                    <button
                      key={key}
                      type="button"
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
                    className="min-h-[44px] rounded-full border px-4 text-sm font-medium"
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
                  onChange={(e) => setAssignDate(e.target.value)}
                />
              </label>

              <label className="text-sm text-gray-700">
                Hora
                <input
                  type="time"
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={assignStartTime}
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
                  onChange={(e) => setWorkerCount(Number(e.target.value || 1))}
                />
              </label>

              <label className="text-sm text-gray-700">
                Furgoneta
                <select
                  className="mt-2 h-12 w-full rounded-2xl border bg-gray-50 px-4 text-base"
                  value={ticket.vehiclePlate || ''}
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
                      disabled={!isAvailable}
                      onChange={(e) => {
                        const nextIds = new Set(ticket.assignedToIds || [])
                        if (e.target.checked) {
                          if (nextIds.size >= workerCount) return
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
                  <div key={index} className="text-sm text-gray-500">
                    {statusLabels[item.status]} · {formatDateTime(item.at)} · {item.byName || ''}
                  </div>
                ))}
                {(!ticket.statusHistory || ticket.statusHistory.length === 0) && (
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
