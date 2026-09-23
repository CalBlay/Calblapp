'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, Users } from 'lucide-react'
import { colorByStage } from '@/lib/colors'
import {
  DEFAULT_SPACES_HEADER_RULE,
  evaluateSpacesHeaderRule,
  type SpacesHeaderRuleConfig,
} from '@/lib/spacesHeaderRule'
import { isActiveSpaceReservation } from '@/lib/spacesReservationStatus'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import SpaceEventModal from '@/components/spaces/SpaceEventModal'
import type { Stage } from '@/services/spaces/spaces'

type RawSpaceEvent = Record<string, unknown>

type SpaceMonthRow = {
  fincaId?: string
  isOwn?: boolean
  finca: string
  dies: Array<{
    date: string
    events: RawSpaceEvent[]
  }>
}

type DayEntry = {
  finca: string
  event: RawSpaceEvent
}

interface SpaceMonthViewProps {
  data: SpaceMonthRow[]
  month: number
  year: number
  headerRule?: SpacesHeaderRuleConfig
  emptyMessage?: string
  onShowWeek: (date: string) => void
  onEventMutated?: () => void
}

const WEEKDAYS = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg']

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

const readText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const readNumber = (value: unknown): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const readStage = (event: RawSpaceEvent): Stage => {
  const stage = readText(event.stage ?? event.StageGroup).toLowerCase()
  if (stage === 'taronja' || stage === 'groc' || stage === 'lila') return stage
  return 'verd'
}

const eventName = (event: RawSpaceEvent) =>
  readText(event.NomEvent) || readText(event.eventName) || readText(event.NomClient) || 'Esdeveniment'

const commercialName = (event: RawSpaceEvent) =>
  readText(event.Comercial) || readText(event.commercial)

const eventPax = (event: RawSpaceEvent) =>
  readNumber(event.NumPax ?? event.numPax)

const stageDotClass = (stage: Stage) => {
  if (stage === 'taronja') return 'bg-orange-500'
  if (stage === 'groc') return 'bg-yellow-400'
  if (stage === 'lila') return 'bg-violet-500'
  return 'bg-emerald-500'
}

const isRuleStage = (event: RawSpaceEvent, rule: SpacesHeaderRuleConfig) => {
  const stage = readStage(event)
  return stage !== 'lila' && rule.stages.includes(stage)
}

export default function SpaceMonthView({
  data,
  month,
  year,
  headerRule = DEFAULT_SPACES_HEADER_RULE,
  emptyMessage = 'No hi ha reserves disponibles per aquest mes.',
  onShowWeek,
  onEventMutated,
}: SpaceMonthViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<RawSpaceEvent | null>(null)
  const [eventModalOpen, setEventModalOpen] = useState(false)

  const entriesByDate = useMemo(() => {
    const byDate = new Map<string, DayEntry[]>()
    data.forEach((row) => {
      row.dies.forEach((day) => {
        if (!day.events.length) return
        const entries = byDate.get(day.date) ?? []
        day.events.forEach((event) => {
          entries.push({
            finca: row.finca,
            event: { ...event, finca: row.finca, Finca: row.finca },
          })
        })
        byDate.set(day.date, entries)
      })
    })
    return byDate
  }, [data])

  const calendarCells = useMemo(() => {
    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leadingEmptyCells = (first.getDay() + 6) % 7
    const cells: Array<{ iso: string; day: number } | null> = Array.from(
      { length: leadingEmptyCells },
      () => null
    )

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day)
      cells.push({ iso: toISODate(date), day })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month, year])

  const selectedEntries = selectedDate ? entriesByDate.get(selectedDate) ?? [] : []
  const selectedActiveEntries = selectedEntries.filter(({ event }) =>
    isActiveSpaceReservation(event)
  )
  const selectedPax = selectedActiveEntries.reduce(
    (sum, { event }) => sum + eventPax(event),
    0
  )
  const selectedFincas = new Set(selectedActiveEntries.map(({ finca }) => finca)).size

  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('ca-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  const openEvent = (event: RawSpaceEvent) => {
    setSelectedDate(null)
    setSelectedEvent(event)
    setEventModalOpen(true)
  }

  const hasVisibleEvents = entriesByDate.size > 0

  return (
    <div className="mt-4 px-2 sm:px-4">
      {emptyMessage && !hasVisibleEvents ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {emptyMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="border-r border-slate-200 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 last:border-r-0 sm:text-xs"
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarCells.map((cell, index) => {
            if (!cell) {
              return (
                <div
                  key={`empty-${index}`}
                  className="min-h-[76px] border-b border-r border-slate-100 bg-slate-50/70 sm:min-h-[142px]"
                />
              )
            }

            const entries = entriesByDate.get(cell.iso) ?? []
            const activeEntries = entries.filter(({ event }) =>
              isActiveSpaceReservation(event)
            )
            const pax = activeEntries.reduce(
              (sum, { event }) => sum + eventPax(event),
              0
            )
            const occupiedFincas = new Set(activeEntries.map(({ finca }) => finca)).size
            const scopedEntries = activeEntries.filter(({ event }) =>
              isRuleStage(event, headerRule)
            )
            const scopedPax = scopedEntries.reduce(
              (sum, { event }) => sum + eventPax(event),
              0
            )
            const highlighted = evaluateSpacesHeaderRule({
              config: headerRule,
              totalPax: scopedPax,
              totalEvents: scopedEntries.length,
            })
            const isToday = cell.iso === toISODate(new Date())

            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDate(cell.iso)}
                className={`min-h-[76px] min-w-0 border-b border-r p-1.5 text-left transition hover:bg-blue-50/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:min-h-[142px] sm:p-2 ${
                  highlighted
                    ? 'border-red-200 bg-red-50/80 hover:bg-red-50'
                    : 'border-slate-100 bg-white'
                }`}
                aria-label={`${cell.day}: ${activeEntries.length} esdeveniments, ${pax} pax`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${
                      isToday ? 'bg-blue-600 text-white' : 'text-slate-700'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {highlighted ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Llindar superat" />
                  ) : null}
                </div>

                {entries.length > 0 ? (
                  <>
                    <div className={`mt-1 text-[9px] font-semibold leading-tight sm:text-[11px] ${highlighted ? 'text-red-700' : 'text-slate-600'}`}>
                      <span>{activeEntries.length} ev.</span>
                      <span className="hidden sm:inline"> · {pax} pax · {occupiedFincas} finques</span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                      {entries.slice(0, 4).map(({ event }, eventIndex) => (
                        <span
                          key={`${readText(event.id)}-${eventIndex}`}
                          className={`h-1.5 w-1.5 rounded-full ${stageDotClass(readStage(event))}`}
                        />
                      ))}
                      {entries.length > 4 ? (
                        <span className="text-[8px] font-semibold text-blue-700">+{entries.length - 4}</span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 hidden space-y-1 sm:block">
                      {entries.slice(0, 3).map(({ finca, event }, eventIndex) => (
                        <div
                          key={`${readText(event.id)}-${eventIndex}`}
                          className={`truncate rounded border px-1.5 py-1 text-[10px] leading-tight ${
                            event.cancelled === true
                              ? 'border-red-300 bg-red-100 text-red-900 line-through'
                              : colorByStage(readStage(event))
                          }`}
                          title={`${finca} · ${eventName(event)}`}
                        >
                          <span className="font-semibold">{finca}</span>
                          <span> · {eventName(event)}</span>
                          {eventPax(event) > 0 ? <span> · {eventPax(event)}p</span> : null}
                        </div>
                      ))}
                      {entries.length > 3 ? (
                        <div className="pl-1 text-[10px] font-semibold text-blue-700">
                          +{entries.length - 3} més
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-500 sm:hidden">
        Toca un dia per veure totes les reserves.
      </p>

      <Sheet open={Boolean(selectedDate)} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent className="flex h-full w-[min(94vw,30rem)] flex-col overflow-hidden p-0 sm:max-w-[30rem]">
          <SheetHeader className="shrink-0 border-b border-slate-200 px-5 py-5 pr-12">
            <SheetTitle className="capitalize">{selectedDateLabel}</SheetTitle>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {selectedActiveEntries.length} esdeveniments
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                <Users className="h-3.5 w-3.5" />
                {selectedPax} pax · {selectedFincas} finques
              </span>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {selectedEntries.length > 0 ? (
              Array.from(new Set(selectedEntries.map(({ finca }) => finca))).map((finca) => (
                <section key={finca}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{finca}</h3>
                  <div className="space-y-2">
                    {selectedEntries
                      .filter((entry) => entry.finca === finca)
                      .map(({ event }, index) => (
                        <button
                          key={`${readText(event.id)}-${index}`}
                          type="button"
                          onClick={() => openEvent(event)}
                          className={`w-full rounded-lg border p-3 text-left shadow-sm transition hover:shadow ${
                            event.cancelled === true
                              ? 'border-red-300 bg-red-100 text-red-950'
                              : colorByStage(readStage(event))
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className={`font-semibold ${event.cancelled === true ? 'line-through' : ''}`}>
                              {eventName(event)}
                            </span>
                            {event.warning === true ? (
                              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Possible conflicte" />
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
                            {commercialName(event) ? <span>{commercialName(event)}</span> : null}
                            {eventPax(event) > 0 ? <span>{eventPax(event)} pax</span> : null}
                            {event.cancelled === true ? <span className="font-semibold">Cancel·lada</span> : null}
                          </div>
                        </button>
                      ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No hi ha reserves per aquest dia.
              </div>
            )}
          </div>

          {selectedDate ? (
            <div className="shrink-0 border-t border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => onShowWeek(selectedDate)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Veure la setmana d’aquest dia
              </button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <SpaceEventModal
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
        event={selectedEvent}
        onMutated={onEventMutated}
      />
    </div>
  )
}
