'use client'

import type React from 'react'
import { CalendarDays } from 'lucide-react'

import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { COMMERCIAL_RESERVATION_STATUS_LABELS, getCommercialReservationEndDate, type CommercialReservation } from '@/lib/commercialReservations'
import {
  CorporateFilterBadgeGroup,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { cn } from '@/lib/utils'
import type { FiltersState } from '@/components/layout/FiltersBar'
import { dayAvailabilityVisual, isoDate, reservationDateLabel } from '../utils'

type Props = {
  monthLabel: string
  monthDate: Date
  days: Date[]
  todayIso: string
  loading: boolean
  requestFilters: FiltersState
  filteredMyReservations: CommercialReservation[]
  freeCapacityRatioByDay: Map<string, number>
  pendingReservationsByDay: Map<string, number>
  onMonthDateChange: React.Dispatch<React.SetStateAction<Date>>
  onOpenReservation: (dayIso: string) => void
  onRequestDatesChange: (next: SmartFiltersChange) => void
  onRequestStatusChange: (value: string) => void
  onCancelReservation: (id: string) => Promise<void>
  saving: boolean
}

export default function RequestTab({
  monthLabel,
  monthDate,
  days,
  todayIso,
  loading,
  requestFilters,
  filteredMyReservations,
  freeCapacityRatioByDay,
  pendingReservationsByDay,
  onMonthDateChange,
  onOpenReservation,
  onRequestDatesChange,
  onRequestStatusChange,
  onCancelReservation,
  saving,
}: Props) {
  return (
    <div className="space-y-5">
      <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
        <CardContent className="px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onMonthDateChange((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
            >
              Mes anterior
            </Button>

            <div className="text-center">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-sky-700">Calendari</div>
              <div className="text-2xl font-semibold capitalize text-slate-900">{monthLabel}</div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onMonthDateChange((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
            >
              Mes següent
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {days.map((day) => {
              const dayIso = isoDate(day)
              const sameMonth = day.getMonth() === monthDate.getMonth()
              const isPastDay = dayIso < todayIso
              const availabilityVisual = dayAvailabilityVisual(freeCapacityRatioByDay.get(dayIso) ?? 1)
              const pendingCount = pendingReservationsByDay.get(dayIso) || 0

              return (
                <button
                  key={dayIso}
                  type="button"
                  onClick={() => onOpenReservation(dayIso)}
                  disabled={isPastDay}
                  className={cn(
                    'min-h-[132px] rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55',
                    sameMonth
                      ? isPastDay
                        ? 'border-gray-100 bg-gray-100 text-gray-400'
                        : availabilityVisual.tone
                      : 'border-gray-100 bg-gray-50 text-gray-400'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold">{day.getDate()}</div>
                    {!isPastDay && pendingCount > 0 ? (
                      <span
                        className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white/80"
                        title={pendingCount === 1 ? '1 pendent' : `${pendingCount} pendents`}
                        aria-label={pendingCount === 1 ? '1 pendent' : `${pendingCount} pendents`}
                      />
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="rounded-3xl border-gray-200 bg-white">
          <CardContent className="px-4 py-5">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <CalendarDays className="h-5 w-5 text-sky-700" />
              Les meves sol·licituds
            </div>

            <div className="mt-3 flex items-center justify-end">
              <Badge variant="outline" className="px-3 py-1 text-sm">
                {filteredMyReservations.length} resultat{filteredMyReservations.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <CorporateFiltersShell variant="toolbar" className="mt-4" showHeader={false}>
              <SmartFilters
                modeDefault="week"
                modeOptions={['week', 'month', 'year', 'day', 'range']}
                role="Treballador"
                showDepartment={false}
                showWorker={false}
                showLocation={false}
                showStatus={false}
                compact
                onChange={onRequestDatesChange}
                initialStart={requestFilters.start}
                initialEnd={requestFilters.end}
              />
              <CorporateFilterBadgeGroup
                className="lg:ml-auto"
                value={requestFilters.status ?? '__all__'}
                onChange={onRequestStatusChange}
                allLabel="Totes"
                allValue="__all__"
                options={[
                  { value: 'pending', label: 'Pendents' },
                  { value: 'confirmed', label: 'Confirmades' },
                  { value: 'cancelled', label: 'Cancel·lades' },
                  { value: 'rejected', label: 'Rebutjades' },
                ]}
              />
            </CorporateFiltersShell>

            <div className="mt-4 space-y-3">
              {loading ? <div className="text-sm text-slate-500">Carregant...</div> : null}
              {!loading && filteredMyReservations.length === 0 ? (
                <div className="text-sm text-slate-500">Encara no tens cap sol·licitud.</div>
              ) : null}

              {filteredMyReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        reservation.status === 'confirmed'
                          ? 'success'
                          : reservation.status === 'cancelled'
                            ? 'secondary'
                            : reservation.status === 'rejected'
                              ? 'destructive'
                              : 'warning'
                      }
                    >
                      {COMMERCIAL_RESERVATION_STATUS_LABELS[reservation.status]}
                    </Badge>
                    {reservation.assignedVehiclePlate ? (
                      <Badge variant="outline">{reservation.assignedVehiclePlate}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 font-semibold text-slate-900">{reservation.reason}</div>
                  <div className="mt-1 text-sm text-slate-600">{reservationDateLabel(reservation)}</div>
                  {getCommercialReservationEndDate(reservation) !== reservation.date ? (
                    <div className="mt-1 text-xs font-medium text-slate-500">
                      Franja completa: {reservationDateLabel(reservation)}
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm text-slate-600">{reservation.destination}</div>
                  {reservation.status === 'pending' || reservation.status === 'confirmed' ? (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onCancelReservation(reservation.id)}
                        disabled={saving}
                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        Anul·lar reserva
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-sky-100 bg-sky-50">
          <CardContent className="px-4 py-5">
            <div className="text-sm font-semibold text-sky-900">Com funciona</div>
            <div className="mt-3 space-y-3 text-sm text-sky-900/90">
              <p>1. Veus el calendari i quants comercials hi ha lliures cada dia.</p>
              <p>2. Clices el dia i fas la sol·licitud en dos minuts.</p>
              <p>3. El cap de transports rep un avís, valida i assigna vehicle.</p>
              <p>4. El comercial rep la notificació amb la confirmació o el rebuig.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
