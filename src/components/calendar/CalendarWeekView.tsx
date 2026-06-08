// file: src/components/calendar/CalendarWeekView.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import CalendarModal from './CalendarModal'
import type { Deal } from '@/hooks/useCalendarData'
import { colorByLN } from '@/lib/colors'
import {
  CALENDAR_BADGE_TEXT,
  CALENDAR_EVENT_TEXT,
  CALENDAR_WEEK_HEADER,
} from '@/lib/calendarTypography'
import { useCalendarVisibleLanes } from '@/hooks/useCalendarVisibleLanes'

const VISIBLE_LANES_MOBILE = 4
const BREAKPOINT_TABLET = 1024
const BREAKPOINT_MOBILE = 640

const diffDays = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))

const pickDateIso = (ev: Deal, keys: string[]) => {
  const row = ev as Deal & Record<string, unknown>
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.length >= 10) return v.slice(0, 10)
  }
  return ''
}

function dotColorByCollection(collection?: string) {
  const c = (collection || '').toLowerCase()
  if (c.includes('verd')) return 'bg-green-500'
  if (c.includes('taronja')) return 'bg-amber-500'
  if (c.includes('groc')) return 'bg-yellow-500'
  if (c.includes('blau')) return 'bg-blue-500'
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

type Span = {
  ev: Deal
  startIdx: number
  endIdx: number
  lane: number
}

export default function CalendarWeekView({
  deals,
  start,
  onCreated,
  showCodeStatus,
  onRequestPanel,
}: {
  deals: Deal[]
  start?: string
  onCreated?: () => void
  showCodeStatus?: boolean
  onRequestPanel?: (deal: Deal) => void
}) {
  const [layout, setLayout] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w < BREAKPOINT_MOBILE) return setLayout('mobile')
      if (w < BREAKPOINT_TABLET) return setLayout('tablet')
      return setLayout('desktop')
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const weekDays = useMemo(() => {
    const base = start ? parseISO(start) : new Date()
    return Array.from({ length: 7 }, (_, i) => addDays(base, i))
  }, [start])

  const spans = useMemo(() => {
    if (!weekDays.length) return [] as Span[]
    const weekStart = weekDays[0]
    const spans: Span[] = []
    const lastDayIdx = weekDays.length - 1

    deals.forEach((ev) => {
      const sIso = pickDateIso(ev, ['DataInici', 'Data'])
      const eIso = pickDateIso(ev, ['DataFi', 'DataInici', 'Data'])
      if (!sIso || !eIso) return

      const sDate = parseISO(sIso)
      const eDate = parseISO(eIso)

      const startIdx = Math.max(0, diffDays(sDate, weekStart))
      const endIdx = Math.min(lastDayIdx, diffDays(eDate, weekStart))
      if (endIdx < 0 || startIdx > lastDayIdx) return

      spans.push({ ev, startIdx, endIdx, lane: 0 })
    })

    spans.sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx)

    // assignacio de lanes evitant solapaments
    const laneEnds: number[] = []
    spans.forEach((span) => {
      let lane = laneEnds.findIndex((end) => span.startIdx > end)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = span.endIdx
      span.lane = lane
    })

    return spans
  }, [deals, weekDays])

  const dynamicLanes = useCalendarVisibleLanes({ mode: 'week' })

  const maxLane = spans.reduce((m, s) => Math.max(m, s.lane), -1)
  const laneCount = maxLane + 1
  const laneLimit = layout === 'mobile' ? VISIBLE_LANES_MOBILE : dynamicLanes
  const visibleLaneCount = Math.min(laneLimit, laneCount)
  const visibleSpans = spans.filter((s) => s.lane < visibleLaneCount)

  const baseHeight = layout === 'mobile' ? 200 : layout === 'tablet' ? 230 : 260
  const rowHeight = layout === 'mobile' ? 36 : layout === 'tablet' ? 42 : 48
  const paddingExtra = layout === 'mobile' ? 60 : layout === 'tablet' ? 90 : 120
  const minHeight = Math.max(baseHeight, visibleLaneCount * rowHeight + paddingExtra)

  // amplada minima per columna nomes per scroll/UX; el grid intern fa minmax(0,1fr)
  const minColWidth = layout === 'mobile' ? 120 : layout === 'tablet' ? 150 : 170
  const gridMinWidth = weekDays.length * minColWidth

  const weekCells = weekDays.map((d) => ({
    date: d,
    // IMPORTANT: no dependre d'ISO per calcul; aqui nomes per key estable
    iso: format(d, 'yyyy-MM-dd'),
  }))

  const gridCols = `repeat(${weekDays.length}, minmax(0, 1fr))`

  return (
    <div className="w-full overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
      {layout === 'mobile' && (
        <p className="mb-2 px-1 text-[11px] text-slate-500">
          Llisca horizontalment per veure tots els dies.
        </p>
      )}
      <div
        className="relative min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
        style={{ minHeight, minWidth: gridMinWidth }}
      >
        {/* Header */}
        <div
          className={`grid border-b bg-slate-50 ${CALENDAR_WEEK_HEADER} text-gray-600`}
          style={{ gridTemplateColumns: gridCols }}
        >
          {weekDays.map((d) => (
            <div
              key={d.toISOString()}
              className={`min-h-11 py-2 text-center font-medium leading-tight ${
                layout === 'mobile' ? 'whitespace-pre-line text-[11px]' : ''
              }`}
            >
              {layout === 'mobile'
                ? `${format(d, 'EEE', { locale: es })}\n${format(d, 'd', { locale: es })}`
                : format(d, 'EEE d', { locale: es })}
            </div>
          ))}
        </div>

        {/* Cells + events */}
        <div className="relative grid bg-gray-50" style={{ gridTemplateColumns: gridCols }}>
          {weekCells.map((c) => (
            <div key={c.iso} className="relative border-r bg-white" style={{ minHeight }} />
          ))}

          {/* Layer d'events: IMPORTANT overflow-hidden per evitar "bleed" en Android horitzontal */}
          <div
            className={`pointer-events-none absolute inset-0 isolate grid overflow-hidden ${
              layout === 'mobile' ? 'gap-1.5 px-1.5 pb-2 pt-4' : 'gap-2 px-2 pb-2 pt-6'
            }`}
            style={{
              gridTemplateColumns: gridCols,
              gridAutoRows: layout === 'mobile' ? 'minmax(32px, auto)' : 'minmax(38px, auto)',
            }}
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
                        pointer-events-auto min-w-0 overflow-hidden bg-clip-padding
                        whitespace-normal
                        ${isSingleDay ? 'px-2 py-[2px]' : 'px-2 py-[4px]'}
                        rounded-md
                        ring-1 ring-inset ring-slate-200
                        flex items-center gap-2
                        ${CALENDAR_EVENT_TEXT}
                        ${colorByLN(span.ev.LN)}
                      `}
                      style={{
                        gridColumn: `${span.startIdx + 1} / ${span.endIdx + 2}`,
                        gridRowStart: span.lane + 1,
                        // ajuda en alguns Android a evitar artefactes de subpixel
                        transform: 'translateZ(0)',
                      }}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColorByCollection(span.ev.collection)}`} />
                      <span className="min-w-0 flex-1 text-left leading-tight line-clamp-2">
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

            {/* +X mes per dia */}
            {weekDays.map((d, dayIdx) => {
              const segments = spans
                .filter((s) => s.startIdx <= dayIdx && s.endIdx >= dayIdx)
                .sort((a, b) => a.lane - b.lane)

              const hidden = segments.filter((s) => s.lane >= visibleLaneCount)
              if (!hidden.length) return null

              return (
                <div
                  key={`more-${dayIdx}`}
                  style={{
                    gridColumn: `${dayIdx + 1} / ${dayIdx + 2}`,
                    gridRowStart: visibleLaneCount + 1,
                  }}
                  className="flex items-center pointer-events-auto"
                >
                  <MoreEventsPopup
                    date={d}
                    events={hidden.map((h) => h.ev)}
                    showCodeStatus={showCodeStatus}
                    onRequestPanel={onRequestPanel}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function MoreEventsPopup({
  date,
  events,
  showCodeStatus,
  onRequestPanel,
}: {
  date: Date
  events: Deal[]
  showCodeStatus?: boolean
  onRequestPanel?: (deal: Deal) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className="min-h-9 rounded-md px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        +{events.length} mes
      </button>

      <DialogContent className="h-[80dvh] w-[95dvw] max-w-sm sm:h-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold capitalize">
            Esdeveniments del {format(date, 'EEEE d MMMM', { locale: es })}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 max-h-[60dvh] space-y-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {events.map((ev) => {
            const badge = showCodeStatus ? codeBadgeFor(ev) : null
            return (
              <CalendarModal
                key={`more-${ev.id}`}
                deal={ev}
                onRequestPanel={onRequestPanel}
                trigger={
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center gap-2 truncate rounded-md ring-1 ring-inset ring-slate-200 bg-white px-2 py-1 ${CALENDAR_EVENT_TEXT}`}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotColorByCollection(ev.collection)}`} />
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
