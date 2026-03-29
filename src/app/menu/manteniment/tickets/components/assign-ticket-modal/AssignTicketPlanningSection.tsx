import type { Dispatch, SetStateAction } from 'react'
import { formatDateOnly } from '@/lib/date-format'
import { typography } from '@/lib/typography'
import type { Ticket, TransportItem, UserItem } from '../../types'

type VehicleTypeOption = { value: string; label: string }

type Props = {
  isAssignedStage: boolean
  isValidated: boolean
  assignDate: string
  setAssignDate: (value: string) => void
  assignStartTime: string
  setAssignStartTime: (value: string) => void
  assignDuration: string
  setAssignDuration: (value: string) => void
  workerCount: number
  setWorkerCount: (value: number) => void
  availabilityLoading: boolean
  hasAvailabilityContext: boolean
  maintenanceUsers: UserItem[]
  availableIds: string[]
  ticket: Ticket
  setSelected: Dispatch<SetStateAction<Ticket | null>>
  selectedVehicleType: string
  setSelectedVehicleType: (value: string) => void
  vehicleTypeOptions: VehicleTypeOption[]
  availableVehicleOptions: TransportItem[]
  onAssignVehicle: (
    ticket: Ticket,
    needsVehicle: boolean,
    vehicleType: string | null,
    plate: string | null
  ) => void
  formatDateTime: (value?: number | string | null) => string
}

export default function AssignTicketPlanningSection({
  isAssignedStage,
  isValidated,
  assignDate,
  setAssignDate,
  assignStartTime,
  setAssignStartTime,
  assignDuration,
  setAssignDuration,
  workerCount,
  setWorkerCount,
  availabilityLoading,
  hasAvailabilityContext,
  maintenanceUsers,
  availableIds,
  ticket,
  setSelected,
  selectedVehicleType,
  setSelectedVehicleType,
  vehicleTypeOptions,
  availableVehicleOptions,
  onAssignVehicle,
  formatDateTime,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {assignDate ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {formatDateOnly(assignDate)}
            </span>
          ) : null}
          {availabilityLoading ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Comprovant disponibilitat...
            </span>
          ) : assignDate && assignStartTime ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Nomes disponibles
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl bg-slate-50/70 p-3">
          <div className={typography('eyebrow')}>Franja de treball</div>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_0.9fr]">
              <label className="text-sm text-gray-700">
                <div className={typography('eyebrow')}>Data</div>
                <input
                  type="date"
                  className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                  value={assignDate}
                  disabled={isValidated}
                  onChange={(e) => setAssignDate(e.target.value)}
                />
              </label>

              <label className="text-sm text-gray-700">
                <div className={typography('eyebrow')}>Hora</div>
                <input
                  type="time"
                  className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                  value={assignStartTime}
                  disabled={isValidated}
                  onChange={(e) => setAssignStartTime(e.target.value)}
                />
              </label>
          </div>
        </section>

        <section className="rounded-2xl bg-slate-50/70 p-3">
          <div className={typography('eyebrow')}>Vehicle</div>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-[0.95fr_1.05fr]">
              <label className="text-sm text-gray-700">
                <div className={typography('eyebrow')}>Tipus</div>
                <select
                  className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                  value={selectedVehicleType}
                  disabled={isValidated}
                  onChange={(e) => {
                    const nextType = e.target.value
                    setSelectedVehicleType(nextType)
                    onAssignVehicle(ticket, !!nextType, nextType || null, null)
                  }}
                >
                  <option value="">Sense vehicle</option>
                  {vehicleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-700">
                <div className={typography('eyebrow')}>Matricula</div>
                <select
                  className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                  value={ticket.vehiclePlate || ''}
                  disabled={isValidated || !selectedVehicleType}
                  onChange={(e) =>
                    onAssignVehicle(ticket, !!selectedVehicleType, selectedVehicleType || null, e.target.value || null)
                  }
                >
                  <option value="">Sense assignar</option>
                  {availableVehicleOptions.map((transport) => (
                    <option key={transport.id} value={transport.plate}>
                      {transport.plate}
                    </option>
                  ))}
                </select>
              </label>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border-t border-slate-200 pt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_auto_1fr] md:items-center">
          <div className="flex items-center gap-3">
            <div className={typography('eyebrow')}>Operaris disponibles</div>
            <div className="text-xs text-slate-500">
              Seleccionats {ticket.assignedToIds?.length || 0}/{workerCount}
            </div>
          </div>
          <div className="flex items-center gap-2 md:justify-self-start">
            <span className="text-xs text-slate-500">Treballadors</span>
            <input
              type="number"
              min={1}
              max={10}
              className="h-8 w-14 rounded-xl border bg-white px-2.5 text-center text-sm text-slate-700"
              value={workerCount}
              disabled={isValidated}
              onChange={(e) => setWorkerCount(Number(e.target.value || 1))}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex items-center gap-2 md:justify-self-start">
            <span className="text-xs text-slate-500">Durada</span>
            <input
              type="time"
              step={60}
              className="h-8 w-24 rounded-xl border bg-white px-2.5 text-center text-sm text-slate-700"
              value={assignDuration}
              disabled={isValidated}
              onChange={(e) => setAssignDuration(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div />
        </div>

        <div className="mt-3 flex flex-wrap gap-2.5">
            {maintenanceUsers.map((u) => {
              const checked = ticket.assignedToIds?.includes(u.id)
              const isAvailable = !hasAvailabilityContext || availableIds.includes(u.id)
              return (
                <label
                  key={u.id}
                  className={`flex min-h-[40px] items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm ${
                    checked
                      ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                      : isAvailable
                        ? 'border-slate-200 bg-slate-50 text-slate-800'
                        : 'border-slate-200 bg-slate-100 text-slate-400'
                  }`}
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
                  {!isAvailable && !checked ? (
                    <span className="text-[11px] text-slate-400">Ocupat</span>
                  ) : null}
                </label>
                )
              })}
        </div>
      </section>

      {ticket.assignedAt ? (
        <div className="text-sm text-gray-500">
          Assignat: {formatDateTime(ticket.assignedAt)} - {ticket.assignedByName || ''}
        </div>
      ) : null}
    </div>
  )
}
