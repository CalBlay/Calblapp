// file: src/components/calendar/CalendarMonthView.tsx
'use client'

import React, { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import CalendarModal from './CalendarModal'
import CalendarNewEventModal from './CalendarNewEventModal'
import type { Deal } from '@/hooks/useCalendarData'
import { colorByLN } from '@/lib/colors'
import { useCalendarVisibleLanes } from '@/hooks/useCalendarVisibleLanes'

function dotColorByCollection(collection?: string) {
  const c = (collection || '').toLowerCase()
  if (c.includes('verd')) return 'bg-green-500'
  if (c.includes('taronja')) return 'bg-amber-500'
  if (c.includes('taronja')) return 'bg-blue-500'
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

export default function CalendarMonthView({
  deals,
  start,
  onCreated,
  showCodeStatus,
}: {
  deals: Deal[]
  start?: string
  onCreated?: () => void
  showCodeStatus?: boolean
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

  return (
    <div className="flex flex-col w-full h-auto">
      <div className="sm:hidden sticky top-0 z-10 bg-white py-3 text-center font-semibold text-lg border-b shadow-sm">
        {monthLabel}
      </div>

      <div className="grid grid-cols-7 text-[10px] sm:text-xs text-gray-600 bg-gray-50 border-b">
        {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map((d) => (
          <div key={d} className="py-1 sm:py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="overflow-visible">
        {weeks.map((week, wIdx) => {
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
          const minHeight = Math.max(130, visibleLaneCount * 30 + 70)
          const visibleSpans = spans.filter((s) => s.lane < visibleLaneCount)

          return (
            <div
              key={wIdx}
              className="
                relative
                grid grid-cols-7 
                border-b 
                bg-gray-50
              "
              style={{ minHeight }}
            >
              {/* Dia + numero */}
              {week.map((c) => (
                <div
                  key={c.iso}
                  onClick={() => !c.isOther && setSelectedDate(c.iso)}
                  className={`
                    relative border-r p-1 
                    flex flex-col 
                    ${c.isOther ? 'bg-gray-50 text-gray-400' : 'bg-white'}
                  `}
                >
                  <div
                    className={`
                      text-[11px] sm:text-xs font-semibold leading-none
                      ${c.isOther ? 'text-gray-300' : 'text-slate-600'}
                    `}
                  >
                    {c.date.getDate()}
                  </div>
                </div>
              ))}

              {/* Franges multi-dia */}
              <div
                className="
                  absolute inset-0
                  grid grid-cols-7 gap-2
                  px-2 pb-2 pt-6
                  pointer-events-none
                "
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
                      trigger={
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`
                            pointer-events-auto
                            truncate ${isSingleDay ? 'px-2 py-[2px]' : 'px-2 py-[4px]'}
                            rounded-md border 
                            flex items-center ${isSingleDay ? 'justify-start' : 'justify-center'} gap-2
                            text-[10px] sm:text-[12px] font-medium
                            ${colorByLN(span.ev.LN)}
                          `}
                          style={{
                            gridColumn: `${span.startIdx + 1} / ${span.endIdx + 2}`,
                            gridRowStart: span.lane + 1,
                          }}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${dotColorByCollection(span.ev.collection)}`}
                          />
                          <span className={`truncate ${isSingleDay ? 'text-left' : 'text-center'} flex-1`}>
                            {span.ev.NomEvent}
                          </span>
                          {badge && (
                            <span
                              className={`ml-1 shrink-0 rounded-full border px-1.5 py-[1px] text-[10px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                      }
                    />
                  )
                })}

                {/* Botons +X mes per dies amb lanes ocultes */}
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
                      className="flex items-center pointer-events-auto"
                    >
                      <MoreEventsPopup
                        events={hidden.map((h) => h.ev)}
                        date={c.date}
                        showCodeStatus={showCodeStatus}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {selectedDate && (
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
}: {
  events: Deal[]
  date: Date
  showCodeStatus?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className="text-[10px] text-gray-400 italic cursor-pointer hover:text-blue-500"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        +{events.length} mes
      </div>

      <DialogContent className="max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {date.toLocaleDateString('ca-ES', {
              day: 'numeric',
              month: 'long',
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-[60dvh] overflow-y-auto">
          {events.map((ev) => {
            const badge = showCodeStatus ? codeBadgeFor(ev) : null
            return (
              <CalendarModal
                key={ev.id}
                deal={ev}
                trigger={
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`
                      flex items-center gap-2
                      truncate px-1.5 py-[3px] rounded-md border
                      text-[11px] sm:text-[12px]
                      ${colorByLN(ev.LN)}
                    `}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${dotColorByCollection(ev.collection)}`}
                    />
                    <span className="truncate flex-1">{ev.NomEvent}</span>
                    {badge && (
                      <span
                        className={`ml-1 shrink-0 rounded-full border px-1.5 py-[1px] text-[10px] font-semibold ${badge.className}`}
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
