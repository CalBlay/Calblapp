'use client'

import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { FiltersState } from '@/components/layout/FiltersBar'
import { getCommercialReservationEndDate, type CommercialReservation, type CommercialReservationStatus } from '@/lib/commercialReservations'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'
import {
  CorporateFilterBadgeGroup,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle } from 'lucide-react'
import { reservationDateLabel } from '../utils'

type VehicleOption = {
  id: string
  plate: string
  type: string
}

type Props = {
  filters: FiltersState
  manageableReservations: CommercialReservation[]
  loading: boolean
  saving: boolean
  selectedVehicleByReservation: Record<string, string>
  onValidationDatesChange: (next: SmartFiltersChange) => void
  onValidationStatusChange: (value: string) => void
  onVehicleChange: (reservationId: string, vehicleId: string) => void
  onValidation: (id: string, status: CommercialReservationStatus) => Promise<void>
  onCancelReservation: (id: string) => Promise<void>
  getVehicleOptions: (reservation: CommercialReservation) => VehicleOption[]
}

export default function ValidationTab({
  filters,
  manageableReservations,
  loading,
  saving,
  selectedVehicleByReservation,
  onValidationDatesChange,
  onValidationStatusChange,
  onVehicleChange,
  onValidation,
  onCancelReservation,
  getVehicleOptions,
}: Props) {
  return (
    <div className="space-y-4">
      <CorporateFiltersShell variant="toolbar" showHeader={false}>
        <SmartFilters
          modeDefault="week"
          modeOptions={['week', 'month', 'year', 'day', 'range']}
          role="Treballador"
          showDepartment={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          compact
          onChange={onValidationDatesChange}
          initialStart={filters.start}
          initialEnd={filters.end}
        />
        <CorporateFilterBadgeGroup
          className="lg:ml-auto"
          value={filters.status ?? '__all__'}
          onChange={onValidationStatusChange}
          allLabel="Totes"
          allValue="__all__"
          options={[
            { value: 'pending', label: 'Pendents' },
            { value: 'confirmed', label: 'Confirmades' },
          ]}
        />
      </CorporateFiltersShell>

      <Card className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <CardContent className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">Gestió de reserves</div>
              <div className="mt-1 text-sm text-slate-500">
                Tria vehicle, valida o anul·la la reserva des d&apos;aquí.
              </div>
            </div>
            <Badge variant="warning" className="px-3 py-1 text-sm">
              {manageableReservations.length} activa{manageableReservations.length === 1 ? '' : 's'}
            </Badge>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? <div className="text-sm text-slate-500">Carregant...</div> : null}
            {!loading && manageableReservations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-slate-500">
                No hi ha reserves per aquest filtre.
              </div>
            ) : null}

            {manageableReservations.map((reservation) => {
              const vehicleOptions = getVehicleOptions(reservation)
              const selectedVehicleId =
                selectedVehicleByReservation[reservation.id] || reservation.assignedVehicleId || ''
              const isPending = reservation.status === 'pending'
              const canConfirm =
                isPending &&
                selectedVehicleId &&
                vehicleOptions.some((vehicle) => vehicle.id === selectedVehicleId)

              return (
                <div
                  key={reservation.id}
                  className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 shadow-sm"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_340px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isPending ? 'warning' : 'success'}>
                          {isPending ? 'Pendent' : 'Confirmada'}
                        </Badge>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {reservationDateLabel(reservation)}
                        </span>
                        {reservation.assignedVehiclePlate ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            {reservation.assignedVehiclePlate}
                          </span>
                        ) : null}
                      </div>

                      {getCommercialReservationEndDate(reservation) !== reservation.date ? (
                        <div className="mt-2 text-xs font-medium text-slate-500">
                          Franja completa: {reservationDateLabel(reservation)}
                        </div>
                      ) : null}

                      <div className="mt-3 text-lg font-semibold leading-tight text-slate-900">
                        {reservation.reason}
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Comercial
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-800">
                            {reservation.requesterName}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Destinació
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-800">
                            {reservation.destination}
                          </div>
                        </div>
                      </div>

                      {reservation.notes ? (
                        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500">
                          {reservation.notes}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                        {isPending ? 'Assignació' : 'Reserva activa'}
                      </div>

                      {isPending ? (
                        <>
                          <label className="mt-2 block text-sm font-medium text-slate-700">
                            Vehicle a assignar
                          </label>
                          <select
                            value={selectedVehicleId}
                            onChange={(event) => onVehicleChange(reservation.id, event.target.value)}
                            className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm"
                          >
                            <option value="">Selecciona vehicle</option>
                            {vehicleOptions.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.plate} · {TRANSPORT_TYPE_LABELS[vehicle.type] || vehicle.type}
                              </option>
                            ))}
                          </select>

                          <div className="mt-2 min-h-[18px] text-xs">
                            {vehicleOptions.length === 0 ? (
                              <span className="text-red-600">No hi ha comercials lliures per aquesta franja.</span>
                            ) : (
                              <span className="text-slate-500">
                                {vehicleOptions.length} vehicle{vehicleOptions.length === 1 ? '' : 's'} disponible{vehicleOptions.length === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="mt-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700">
                          Vehicle assignat:{' '}
                          <span className="font-semibold text-slate-900">
                            {reservation.assignedVehiclePlate || 'Sense assignar'}
                          </span>
                        </div>
                      )}

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        {isPending ? (
                          <Button
                            type="button"
                            onClick={() => void onValidation(reservation.id, 'confirmed')}
                            disabled={saving || !canConfirm}
                            className="flex-1"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Validar
                          </Button>
                        ) : null}
                        {isPending ? (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void onValidation(reservation.id, 'rejected')}
                            disabled={saving}
                            className="flex-1"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Rebutjar
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant={isPending ? 'outline' : 'destructive'}
                          onClick={() => void onCancelReservation(reservation.id)}
                          disabled={saving}
                          className={cn(
                            'flex-1',
                            isPending ? 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800' : ''
                          )}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Anul·lar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
