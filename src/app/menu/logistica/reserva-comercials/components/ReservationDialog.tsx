'use client'

import type React from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ReservationTimelineSlot } from '../types'
import { prettyDate, STANDARD_DAY_END, STANDARD_DAY_START } from '../utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDay: string
  selectedEndDay: string
  setSelectedEndDay: React.Dispatch<React.SetStateAction<string>>
  startTime: string
  endTime: string
  setStartTime: React.Dispatch<React.SetStateAction<string>>
  setEndTime: React.Dispatch<React.SetStateAction<string>>
  destination: string
  setDestination: React.Dispatch<React.SetStateAction<string>>
  reason: string
  setReason: React.Dispatch<React.SetStateAction<string>>
  notes: string
  setNotes: React.Dispatch<React.SetStateAction<string>>
  isMultiDaySelection: boolean
  saving: boolean
  onSubmit: () => Promise<void>
  timeline: ReservationTimelineSlot[]
  totalVehicles: number
}

export default function ReservationDialog({
  open,
  onOpenChange,
  selectedDay,
  selectedEndDay,
  setSelectedEndDay,
  startTime,
  endTime,
  setStartTime,
  setEndTime,
  destination,
  setDestination,
  reason,
  setReason,
  notes,
  setNotes,
  isMultiDaySelection,
  saving,
  onSubmit,
  timeline,
  totalVehicles,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova sol·licitud</DialogTitle>
          <DialogDescription>
            Reserva el dia seleccionat i envia la petició a transports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Dia">
            <Input value={prettyDate(selectedDay)} readOnly />
          </Field>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-900">Disponibilitat 08:00 - 18:00</div>
            <div className="mt-1 text-xs text-slate-500">
              Capacitat del dia: {totalVehicles} vehicle{totalVehicles === 1 ? '' : 's'} x 10 hores
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {timeline.map((slot) => (
                <div
                  key={`${slot.slotStart}-${slot.slotEnd}`}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    slot.freeVehicles === 0
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : slot.freeVehicles < slot.totalVehicles
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  )}
                >
                  <div className="font-semibold">
                    {slot.slotStart} - {slot.slotEnd}
                  </div>
                  <div className="mt-1 text-xs">
                    {slot.freeVehicles}/{slot.totalVehicles} lliures
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Field label="Fins al dia">
            <Input
              type="date"
              min={selectedDay}
              value={selectedEndDay}
              onChange={(event) => setSelectedEndDay(event.target.value)}
            />
          </Field>
          <div className="text-xs text-slate-500">Seleccionat: {prettyDate(selectedEndDay)}</div>

          {isMultiDaySelection ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              Reserva multi-dia: es bloquejarà cada dia complet de 08:00 a 18:00.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hora inici">
              <Input
                type="time"
                value={isMultiDaySelection ? STANDARD_DAY_START : startTime}
                onChange={(event) => setStartTime(event.target.value)}
                disabled={isMultiDaySelection}
              />
            </Field>
            <Field label="Hora fi">
              <Input
                type="time"
                value={isMultiDaySelection ? STANDARD_DAY_END : endTime}
                onChange={(event) => setEndTime(event.target.value)}
                disabled={isMultiDaySelection}
              />
            </Field>
          </div>

          <Field label="Destinació">
            <Input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Client o zona"
            />
          </Field>
          <Field label="Motiu">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Visita, reunió o seguiment"
            />
          </Field>
          <Field label="Observacions">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Indicacions addicionals"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Tancar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void onSubmit()}
            disabled={saving || !destination.trim() || !reason.trim()}
          >
            {saving ? 'Enviant...' : 'Enviar sol·licitud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
