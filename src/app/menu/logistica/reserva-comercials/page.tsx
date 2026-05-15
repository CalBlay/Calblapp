'use client'

import { CarFront } from 'lucide-react'

import ModuleHeader from '@/components/layout/ModuleHeader'
import { Card, CardContent } from '@/components/ui/card'
import RequestTab from './components/RequestTab'
import ReservationDialog from './components/ReservationDialog'
import ValidationTab from './components/ValidationTab'
import { useReservaComercialsPage } from './hooks/useReservaComercialsPage'

export default function ReservaComercialsPage() {
  const page = useReservaComercialsPage()

  return (
    <div className="w-full flex flex-col gap-6 sm:gap-8">
      <ModuleHeader
        title="Reserva comercials / Calendari i validació"
        subtitle="Sol·licitud simple per calendari i assignació per cap de transports"
        icon={<CarFront className="h-8 w-8 text-sky-700" />}
        mainHref="/menu/logistica"
      />

      <section className="space-y-5 px-2 pb-8 sm:px-4">
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => page.setTabAndUrl('sollicitud')}
            className={
              page.tab === 'sollicitud'
                ? 'rounded-full bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition'
                : 'rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-100'
            }
          >
            Sol·licitud
          </button>

          {page.canValidate ? (
            <button
              type="button"
              onClick={() => page.setTabAndUrl('validacio')}
              className={
                page.tab === 'validacio'
                  ? 'rounded-full bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition'
                  : 'rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-100'
              }
            >
              Validació
            </button>
          ) : null}
        </div>

        {page.error ? (
          <Card className="rounded-2xl border-red-200 bg-red-50">
            <CardContent className="px-4 py-3 text-sm text-red-700">{page.error}</CardContent>
          </Card>
        ) : null}

        {page.tab === 'sollicitud' ? (
          <RequestTab
            monthLabel={page.monthLabel}
            monthDate={page.monthDate}
            days={page.days}
            todayIso={page.todayIso}
            loading={page.loading}
            requestFilters={page.requestFilters}
            filteredMyReservations={page.filteredMyReservations}
            freeCapacityRatioByDay={page.freeCapacityRatioByDay}
            pendingReservationsByDay={page.pendingReservationsByDay}
            onMonthDateChange={page.setMonthDate}
            onOpenReservation={page.handleOpenReservation}
            onRequestDatesChange={page.handleRequestDatesChange}
            onRequestStatusChange={(value) =>
              page.setRequestFilters((prev) => ({
                ...prev,
                status: value,
              }))
            }
            onCancelReservation={page.handleCancelReservation}
            saving={page.saving}
          />
        ) : null}

        {page.tab === 'validacio' && page.canValidate ? (
          <ValidationTab
            filters={page.filters}
            manageableReservations={page.manageableReservations}
            loading={page.loading}
            saving={page.saving}
            selectedVehicleByReservation={page.selectedVehicleByReservation}
            onValidationDatesChange={page.handleValidationDatesChange}
            onValidationStatusChange={(value) =>
              page.setFilters((prev) => ({
                ...prev,
                status: value,
              }))
            }
            onVehicleChange={(reservationId, vehicleId) =>
              page.setSelectedVehicleByReservation((current: Record<string, string>) => ({
                ...current,
                [reservationId]: vehicleId,
              }))
            }
            onValidation={page.handleValidation}
            onCancelReservation={page.handleCancelReservation}
            getVehicleOptions={page.availableVehiclesForReservation}
          />
        ) : null}
      </section>

      <ReservationDialog
        open={page.dialogOpen}
        onOpenChange={page.setDialogOpen}
        selectedDay={page.selectedDay}
        selectedEndDay={page.selectedEndDay}
        setSelectedEndDay={page.setSelectedEndDay}
        startTime={page.startTime}
        endTime={page.endTime}
        setStartTime={page.setStartTime}
        setEndTime={page.setEndTime}
        destination={page.destination}
        setDestination={page.setDestination}
        reason={page.reason}
        setReason={page.setReason}
        notes={page.notes}
        setNotes={page.setNotes}
        isMultiDaySelection={page.isMultiDaySelection}
        saving={page.saving}
        onSubmit={page.handleSubmit}
        timeline={page.selectedDayTimeline}
        totalVehicles={page.selectedDayTimeline[0]?.totalVehicles || 0}
      />
    </div>
  )
}
