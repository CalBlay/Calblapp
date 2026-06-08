// file: src/components/calendar/CalendarMonthView.tsx
'use client'

import React, { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import CalendarModal from './CalendarModal'
import CalendarNewEventModal from './CalendarNewEventModal'
import type { Deal } from '@/hooks/useCalendarData'
import { colorByLN } from '@/lib/colors'
import { dealsForDay } from '@/lib/calendarDealDates'
import {
  CALENDAR_BADGE_TEXT,
  CALENDAR_DAY_HEADER,
  CALENDAR_DAY_NUMBER,
  CALENDAR_EVENT_TEXT,
} from '@/lib/calendarTypography'
import { useCalendarVisibleLanes } from '@/hooks/useCalendarVisibleLanes'

function dotColorByCollection(collection?: string) {
  const c = (collection || '').toLowerCase()
  if (c.includes('verd')) return 'bg-green-500'
  if (c.includes('taronja')) return 'bg-amber-500'
  if (c.includes('groc')) return 'bg-yellow-500'
  return 'bg-gray-300'
}

const codeBadgeFor = (ev: Deal) => {
  const status = ev.codeStatus
  if (!status) return null
  if (status === 'confirmed') {
    return { label: 'C', className: 'border-slate-200 bg-slate-50 text-slate-700' }
  }
  if (status === 'review') {
    return { label: 'R', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  }
  return { label: '-', className: 'border-gray-200 bg-gray-50 text-gray-600' }
}

type WeekCell = { date: Date; iso: string; isOther: boolean }

type Span = {
  ev: Deal
  startIdx: number
  endIdx: number
  lane: number
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const diffDays = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))

const pickDateIso = (ev: Deal, keys: string[]) => {
  const rawEvent = ev as Deal & Record<string, unknown>
  for (const k of keys) {
    const v = rawEvent?.[k]
    if (typeof v === 'string' && v.length >= 10) return v.slice(0, 10)
  }
  return ''
}

const startOfWeekMon = (d: Date) => {
  const r = new Date(d)
  const off = (d.getDay() + 6) % 7
  r.setDate(d.getDate() - off)
  return r
}

const endOfWeekMon = (d: Date) => {
  const r = startOfWeekMon(d)
  r.setDate(r.getDate() + 6)
  return r
}

const lnDotClass = (ln?: string) => {
  const key = String(ln || '').toLowerCase().trim()
  if (key.includes('casament')) return 'bg-rose-400'
  if (key.includes('food')) return 'bg-orange-400'
  if (key.includes('empresa') || key.includes('corporate')) return 'bg-blue-400'
  if (key.includes('agenda')) return 'bg-violet-400'
  return 'bg-slate-400'
}

export default function CalendarMonthView({
  deals,
  start,
  onCreated,
  showCodeStatus,
  onRequestPanel,
  selectedDay,
  onSelectDay,
  compactMobile = false,
}: {
  deals: Deal[]
  start?: string
  onCreated?: () => void
  showCodeStatus?: boolean
  onRequestPanel?: (deal: Deal) => void
  selectedDay?: string | null
  onSelectDay?: (iso: string) => void
  compactMobile?: boolean
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const firstIso = deals.length ? pickDateIso(deals[0], ['DataInici', 'Data']) : ''
  const anchor = start
    ? new Date(start)
    : firstIso
    ? new Date(firstIso)
    : new Date()

  const month = anchor.getMonth()
  const year = anchor.getFullYear()

  const monthLabel = new Date(year, month).toLocaleDateString('ca-ES', {
    month: 'long',
    year: 'numeric',
  })

  const dayEventCounts = useMemo(() => {
    const map = new Map<string, Deal[]>()
    if (!compactMobile) return map
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      const iso = toISO(d)
      map.set(iso, dealsForDay(deals, iso))
    }
    return map
  }, [compactMobile, deals, month, year])

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)

    const gridStart = startOfWeekMon(first)
    const gridEnd = endOfWeekMon(last)

    const days: WeekCell[] = []
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const c = new Date(d)
      days.push({
        date: c,
        iso: toISO(c),
        isOther: c.getMonth() !== month,
      })
    }

    const out: WeekCell[][] = []
    for (let i = 0; i < days.length; i += 7) {
      out.push(days.slice(i, i + 7))
    }

    return out
  }, [month, year])

  const visibleLanes = useCalendarVisibleLanes({ mode: 'month', weekCount: weeks.length })

  const handleDayClick = (cell: WeekCell) => {
    if (cell.isOther) return
    if (onSelectDay) {
      onSelectDay(cell.iso)
      return
    }
    setSelectedDate(cell.iso)
  }

  return (
    <div className="flex h-auto w-full flex-col">
      <div className="sticky top-0 z-10 border-b bg-white py-3 text-center text-lg font-semibold shadow-sm sm:hidden">
        {monthLabel}
      </div>

      {compactMobile && (
        <p className="px-3 py-2 text-[11px] text-slate-500 sm:hidden">
          Toca un dia per veure els esdeveniments.
        </p>
      )}

      <div className={`grid grid-cols-7 ${CALENDAR_DAY_HEADER} border-b bg-gray-50 text-gray-600`}>
        {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map((d) => (
          <div key={d} className="py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="overflow-visible">
        {weeks.map((week, wIdx) => {
          if (compactMobile) {
            return (
              <div key={wIdx} className="grid grid-cols-7 border-b bg-gray-50">
                {week.map((c) => {
                  const dayEvents = dayEventCounts.get(c.iso) ?? []
                  const isToday =
                    c.iso === toISO(new Date()) && !c.isOther
                  const isSelected = !c.isOther && selectedDay === c.iso

                  return (
                    <button
                      key={c.iso}
                      type="button"
                      disabled={c.isOther}
                      onClick={() => handleDayClick(c)}
                      className={`
                        relative flex min-h-[52px] flex-col items-center justify-start border-r p-1.5
                        transition-colors
                        ${c.isOther ? 'cursor-default bg-gray-50 text-gray-300' : 'bg-white active:bg-blue-50'}
                        ${isSelected ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/70' : ''}
                      `}
                    >
                      <span
                        className={`
                          flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold
                          ${isToday ? 'bg-blue-600 text-white' : c.isOther ? 'text-gray-300' : 'text-slate-700'}
                        `}
                      >
                        {c.date.getDate()}
                      </span>
                      {!c.isOther && dayEvents.length > 0 && (
                        <div className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-0.5">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <span
                              key={ev.id}
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${lnDotClass(ev.LN)}`}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[9px] font-semibold text-blue-600">
                              +{dayEvents.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      {!c.isOther && dayEvents.length > 0 && (
                        <span className="mt-0.5 text-[9px] font-medium text-slate-500">
                          {dayEvents.length} ev
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          }

          const weekStart = week[0].date
          const spans: Span[] = []

          deals.forEach((ev) => {
            const sIso = pickDateIso(ev, ['DataInici', 'Data'])
            const eIso = pickDateIso(ev, ['DataFi', 'DataInici', 'Data'])
            if (!sIso || !eIso) return

            const sDate = new Date(sIso)
            const eDate = new Date(eIso)
            const startIdx = Math.max(0, diffDays(sDate, weekStart))
            const endIdx = Math.min(6, diffDays(eDate, weekStart))
            if (endIdx < 0 || startIdx > 6) return

            spans.push({
              ev,
              startIdx,
              endIdx,
              lane: 0,
            })
          })

          spans.sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx)

          const laneEnds: number[] = []
          spans.forEach((span) => {
            let lane = laneEnds.findIndex((end) => span.startIdx > end)
            if (lane === -1) lane = laneEnds.length
            laneEnds[lane] = span.endIdx
            span.lane = lane
          })

          const laneCount = laneEnds.length
          const visibleLaneCount = Math.min(visibleLanes, laneCount)
          const minHeight = Math.max(130, visibleLaneCount * 32 + 72)
          const visibleSpans = spans.filter((s) => s.lane < visibleLaneCount)

          return (
            <div
              key={wIdx}
              className="relative grid grid-cols-7 border-b bg-gray-50"
              style={{ minHeight }}
            >
              {week.map((c) => (
                <div
                  key={c.iso}
                  onClick={() => handleDayClick(c)}
                  className={`
                    relative flex cursor-pointer flex-col border-r p-1
                    ${c.isOther ? 'bg-gray-50 text-gray-400' : 'bg-white'}
                    ${!c.isOther && selectedDay === c.iso ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/60' : ''}
                  `}
                >
                  <div
                    className={`
                      ${CALENDAR_DAY_NUMBER}
                      ${c.isOther ? 'text-gray-300' : 'text-slate-600'}
                    `}
                  >
                    {c.date.getDate()}
                  </div>
                </div>
              ))}

              <div
                className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-2 px-2 pb-2 pt-6"
                style={{ gridAutoRows: 'minmax(24px, auto)' }}
              >
                {visibleSpans.map((span, idx) => {
                  const isSingleDay = span.startIdx === span.endIdx
                  const badge = showCodeStatus ? codeBadgeFor(span.ev) : null

                  return (
                    <CalendarModal
                      key={`${span.ev.id}-${idx}`}
                      deal={span.ev}
                      onSaved={onCreated}
                      onRequestPanel={onRequestPanel}
                      trigger={
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`
                            pointer-events-auto
                            truncate ${isSingleDay ? 'px-2 py-[2px]' : 'px-2 py-[4px]'}
                            flex items-center ${isSingleDay ? 'justify-start' : 'justify-center'} gap-2
                            rounded-md border
                            ${CALENDAR_EVENT_TEXT}
                            ${colorByLN(span.ev.LN)}
                          `}
                          style={{
                            gridColumn: `${span.startIdx + 1} / ${span.endIdx + 2}`,
                            gridRowStart: span.lane + 1,
                          }}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${dotColorByCollection(span.ev.collection)}`}
                          />
                          <span
                            className={`truncate ${isSingleDay ? 'text-left' : 'text-center'} flex-1`}
                          >
                            {span.ev.NomEvent}
                          </span>
                          {badge && (
                            <span
                              className={`ml-1 shrink-0 rounded-full border px-1.5 py-[1px] ${CALENDAR_BADGE_TEXT} font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                      }
                    />
                  )
                })}

                {week.map((c, dayIdx) => {
                  const segments = spans
                    .filter((s) => s.startIdx <= dayIdx && s.endIdx >= dayIdx)
                    .sort((a, b) => a.lane - b.lane)
                  const hidden = segments.filter((s) => s.lane >= visibleLaneCount)
                  if (!hidden.length) return null

                  return (
                    <div
                      key={`more-${c.iso}`}
                      style={{
                        gridColumn: `${dayIdx + 1} / ${dayIdx + 2}`,
                        gridRowStart: visibleLaneCount + 1,
                      }}
                      className="pointer-events-auto flex items-center"
                    >
                      <MoreEventsPopup
                        events={hidden.map((h) => h.ev)}
                        date={c.date}
                        showCodeStatus={showCodeStatus}
                        onRequestPanel={onRequestPanel}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {!onSelectDay && selectedDate && (
        <CalendarNewEventModal
          key={selectedDate}
          date={selectedDate}
          trigger={<div />}
          onSaved={() => {
            setSelectedDate(null)
            onCreated?.()
          }}
        />
      )}
    </div>
  )
}

function MoreEventsPopup({
  events,
  date,
  showCodeStatus,
  onRequestPanel,
}: {
  events: Deal[]
  date: Date
  showCodeStatus?: boolean
  onRequestPanel?: (deal: Deal) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className="min-h-8 rounded px-2 py-1 text-[11px] font-medium italic text-gray-500 hover:text-blue-600"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        +{events.length} mes
      </button>

      <DialogContent className="flex max-h-[85dvh] w-[min(95vw,28rem)] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm capitalize">
            {date.toLocaleDateString('ca-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain">
          {events.map((ev) => {
            const badge = showCodeStatus ? codeBadgeFor(ev) : null
            return (
              <CalendarModal
                key={ev.id}
                deal={ev}
                onRequestPanel={onRequestPanel}
                trigger={
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`
                      flex min-h-11 items-center gap-2
                      truncate rounded-md border px-2 py-2
                      ${CALENDAR_EVENT_TEXT}
                      ${colorByLN(ev.LN)}
                    `}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${dotColorByCollection(ev.collection)}`}
                    />
                    <span className="truncate flex-1">{ev.NomEvent}</span>
                    {badge && (
                      <span
                        className={`ml-1 shrink-0 rounded-full border px-1.5 py-[1px] ${CALENDAR_BADGE_TEXT} font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                }
              />
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
