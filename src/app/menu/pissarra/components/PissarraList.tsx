// filename: src/app/menu/pissarra/components/PissarraList.tsx
"use client"

import { format, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns"
import { ca } from "date-fns/locale"
import { formatDateOnly } from '@/lib/date-format'
import { MotionDiv } from '@/lib/lazyMotion'
import PissarraCard from "./PissarraCard"
import PissarraCardLogistica from "./PissarraCardLogistica"
import PissarraCardCuina from "./PissarraCardCuina"
import type { PissarraItem } from "@/hooks/usePissarra"
import { useMemo } from "react"

type Variant = "produccio" | "logistica" | "cuina"

type Props = {
  dataByDay: Record<string, PissarraItem[]>
  canEdit: boolean
  onUpdate: (id: string, payload: Partial<PissarraItem>) => Promise<void>
  weekStart: Date
  weekStartISO: string
  weekEndISO: string
  variant?: Variant
  canOpenQuadrants?: boolean
  quadrantsDepartmentOverride?: 'serveis' | 'logistica' | 'cuina' | null
}

const joinPeople = (people?: string[]) =>
  Array.isArray(people) && people.length > 0 ? people.filter(Boolean).join(', ') : '-'

function PrintEvent({ item, variant }: { item: PissarraItem; variant: Variant }) {
  const vehicles = Array.isArray(item.vehicles)
    ? item.vehicles
        .map((vehicle) =>
          [vehicle?.plate, vehicle?.conductor, vehicle?.type].filter(Boolean).join(' · ')
        )
        .filter(Boolean)
        .join(' | ')
    : ''

  return (
    <article className="pissarra-print-event mb-2 rounded-md border border-slate-300 px-3 py-2 text-[9pt] leading-snug">
      <div className="flex items-start justify-between gap-3">
        <strong className="text-[10pt] text-slate-900">{item.eventName || '-'}</strong>
        <span className="shrink-0 font-semibold text-slate-700">
          {item.startTime || '-'}
          {variant === 'logistica' && item.arrivalTime ? ` · Arribada ${item.arrivalTime}` : ''}
        </span>
      </div>

      {variant === 'produccio' && (
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-700">
          <span><b>Ubicació:</b> {item.location || '-'}</span>
          <span><b>Pax:</b> {item.pax ?? 0}</span>
          <span><b>Servei:</b> {item.servei || '-'}</span>
          <span><b>LN:</b> {item.LN || '-'}</span>
          <span><b>Responsable:</b> {item.responsableName || '-'}</span>
          <span><b>Comercial:</b> {item.comercial || '-'}</span>
        </div>
      )}

      {variant === 'logistica' && (
        <div className="mt-1 space-y-0.5 text-slate-700">
          <div><b>Ubicació:</b> {item.location || '-'}</div>
          {item.phaseLabel && <div><b>Fase:</b> {item.phaseLabel}</div>}
          <div><b>Vehicles:</b> {vehicles || '-'}</div>
          <div><b>Treballadors:</b> {joinPeople(item.workers)}</div>
        </div>
      )}

      {variant === 'cuina' && (
        <div className="mt-1 space-y-0.5 text-slate-700">
          <div className="grid grid-cols-2 gap-x-4">
            <span><b>Ubicació:</b> {item.location || '-'}</span>
            <span><b>Servei / pax:</b> {item.servei || '-'} · {item.pax ?? 0}</span>
          </div>
          <div><b>G1:</b> {item.group1StartTime || '-'} · {item.group1MeetingPoint || '-'} · Resp. {item.group1Responsible || '-'} · Conductors {joinPeople(item.group1Drivers)} · Treballadors {joinPeople(item.group1Workers)}</div>
          {(item.group2StartTime || item.group2MeetingPoint || item.group2Responsible || item.group2Drivers?.length || item.group2Workers?.length) ? (
            <div><b>G2:</b> {item.group2StartTime || '-'} · {item.group2MeetingPoint || '-'} · Resp. {item.group2Responsible || '-'} · Conductors {joinPeople(item.group2Drivers)} · Treballadors {joinPeople(item.group2Workers)}</div>
          ) : null}
        </div>
      )}
    </article>
  )
}

export default function PissarraList({
  dataByDay,
  canEdit,
  onUpdate,
  weekStart,
  weekStartISO,
  weekEndISO,
  variant = "produccio",
  canOpenQuadrants = false,
  quadrantsDepartmentOverride = null,
}: Props) {
  const start = startOfWeek(weekStart, { weekStartsOn: 1 })
  const end = endOfWeek(weekStart, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })

  const quadrantsDepartment = useMemo(() => {
    if (quadrantsDepartmentOverride) return quadrantsDepartmentOverride
    if (variant === "cuina") return "cuina"
    if (variant === "logistica") return "logistica"
    return "serveis"
  }, [quadrantsDepartmentOverride, variant])

  const buildQuadrantsHref = (item: PissarraItem) => {
    const params = new URLSearchParams()
    params.set("department", quadrantsDepartment)
    params.set("start", weekStartISO)
    params.set("end", weekEndISO)
    params.set("openEventId", String(item.id || "").trim().split("__")[0])
    return `/menu/quadrants?${params.toString()}`
  }

  const sortedEventsForDay = (day: Date) => {
    const key = format(day, "yyyy-MM-dd")
    return [...(dataByDay[key] || [])].sort((a, b) => {
      const hA = (a.startTime || "").trim()
      const hB = (b.startTime || "").trim()
      if (!hA && !hB) return 0
      if (!hA) return 1
      if (!hB) return -1
      return hA.localeCompare(hB)
    })
  }

  return (
    <>
    <div
      key={weekStart.toISOString()}
      className="relative w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden"
      data-print="root"
    >
      {/* Header */}
      <div
        className="grid grid-cols-7 min-w-[980px] xl:min-w-[1260px] 2xl:min-w-[1540px] bg-white sticky top-0 z-20 border-b"
        data-print="header"
      >
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="text-center font-semibold text-gray-700 py-2 border-r last:border-r-0 text-sm uppercase bg-white"
          >
            <div>{format(day, "d/MM", { locale: ca })}</div>
            <div className="text-[11px] text-gray-500">{format(day, "EEE", { locale: ca })}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div
        className="grid grid-cols-7 min-w-[980px] xl:min-w-[1260px] 2xl:min-w-[1540px] max-h-[80vh] overflow-y-auto"
        data-print="content"
      >
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const events = sortedEventsForDay(day)

          return (
            <div key={key} className="flex flex-col border-r last:border-r-0 border-gray-200 p-1 bg-gray-50">
              {events.length > 0 ? (
                events.map((ev) => (
                  <MotionDiv key={ev.id} layout>
                    {variant === "logistica" ? (
                      <PissarraCardLogistica
                        item={ev}
                        canOpenQuadrants={canOpenQuadrants}
                        quadrantsHref={buildQuadrantsHref(ev)}
                      />
                    ) : variant === "cuina" ? (
                      <PissarraCardCuina
                        item={ev}
                        canOpenQuadrants={canOpenQuadrants}
                        quadrantsHref={buildQuadrantsHref(ev)}
                      />
                    ) : (
                      <PissarraCard
                        item={ev}
                        canEdit={canEdit}
                        onUpdate={onUpdate}
                        canOpenQuadrants={canOpenQuadrants}
                        quadrantsHref={buildQuadrantsHref(ev)}
                      />
                    )}
                  </MotionDiv>
                ))
              ) : (
                <div className="text-center text-gray-400 text-xs py-6">-</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
    <section className="hidden bg-white text-slate-900 print:block" aria-hidden="true">
      <header className="mb-4 border-b border-slate-300 pb-2">
        <h1 className="text-[16pt] font-bold">Pissarra · {variant === 'produccio' ? 'Producció' : variant === 'logistica' ? 'Logística' : 'Cuina'}</h1>
        <p className="mt-1 text-[9pt] text-slate-600">
          Setmana del {formatDateOnly(weekStartISO, weekStartISO)} al {formatDateOnly(weekEndISO, weekEndISO)}
        </p>
      </header>

      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd")
        const events = sortedEventsForDay(day)
        return (
          <section key={`print-${key}`} className="pissarra-print-day mb-4">
            <div className="pissarra-print-day-header mb-2 flex items-center justify-between border-b-2 border-emerald-800 pb-1">
              <h2 className="text-[12pt] font-bold capitalize">
                {format(day, "EEEE", { locale: ca })} · {formatDateOnly(key, key)}
              </h2>
              <span className="text-[8pt] font-semibold text-slate-500">
                {events.length} {events.length === 1 ? 'esdeveniment' : 'esdeveniments'}
              </span>
            </div>
            {events.length > 0 ? events.map((event) => (
              <PrintEvent key={`print-event-${event.id}`} item={event} variant={variant} />
            )) : <p className="pissarra-print-event py-1 text-[9pt] text-slate-400">Sense esdeveniments</p>}
          </section>
        )
      })}
    </section>
    </>
  )
}
