'use client'

import React, { useMemo, useEffect } from 'react'
import { Users, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import EventTile from './EventTile'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import { useQuadrants } from '@/app/menu/quadrants/hooks/useQuadrants'

interface CalendarViewProps {
  date: string
  events: QuadrantEvent[]
  onEventClick?: (ev: QuadrantEvent) => void
  department: string
  start: string
  end: string
}

export default function CalendarView({
  date,
  events,
  onEventClick,
  department,
  start,
  end,
}: CalendarViewProps) {

  // 📅 Carrega quadrants del rang correcte
  const { quadrants, loading: loadingQuadrants, reload } = useQuadrants(
    department,
    start,
    end
  )

  useEffect(() => {
    const handler = () => {
      reload()
    }

    window.addEventListener('quadrant:created', handler)
    window.addEventListener('quadrant:updated', handler)
    return () => {
      window.removeEventListener('quadrant:created', handler)
      window.removeEventListener('quadrant:updated', handler)
    }
  }, [reload])

  // 🟦 Assigna quadrantStatus a cada event
  const enrichedEvents = useMemo(() => {
    return events.map((ev) => {
      const normalizeCode = (val?: string) =>
        (val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()

      const match = quadrants.find(
        (q) => normalizeCode(q.code) === normalizeCode(ev.code)
      )

      const quadrantStatus: 'confirmed' | 'draft' | null =
        match?.status === 'confirmed'
          ? 'confirmed'
          : match?.status === 'draft'
          ? 'draft'
          : null

      return {
        ...ev,
        service: ev.service ?? undefined,
        commercial: ev.commercial ?? undefined,
        numPax: ev.numPax ?? undefined,
        quadrantStatus,
      }
    })
  }, [events, quadrants])

  // 👥 Comptem persones
  const totalWorkers = useMemo(() => {
    const people = new Set<string>()
    for (const e of events) {
      if (e.responsable) people.add(e.responsable)
      if (Array.isArray(e.conductors))
        e.conductors.forEach((c: any) => people.add(c?.name || c))
      if (Array.isArray(e.treballadors))
        e.treballadors.forEach((t: any) => people.add(t?.name || t))
    }
    return people.size
  }, [events])

  const totalEvents = enrichedEvents.length

  return (
    <section className="mb-6">
      {/* 🟦 Capçalera del dia */}
      <header className="flex items-center justify-between mb-3 bg-indigo-50 p-3 rounded-xl shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          {format(parseISO(date), 'dd/MM/yyyy', { locale: ca })}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700">
            <Calendar className="w-3 h-3" />
            {totalEvents} quadrant{totalEvents !== 1 && 's'}
          </span>
        </h2>

        <span className="flex items-center gap-1 text-pink-600 font-bold">
          <Users className="w-4 h-4" />
          {totalWorkers} {totalWorkers === 1 ? 'persona' : 'persones'}
        </span>
      </header>

      {/* 🔸 Targetes */}
      <div className="flex flex-col gap-3 bg-white">
        {loadingQuadrants && (
          <p className="text-center text-sm text-gray-400 py-2">
            Carregant quadrants...
          </p>
        )}

        {!loadingQuadrants &&
          enrichedEvents.map((ev) => (
            <div
              key={ev.id}
              className="relative"
              onClick={() => onEventClick?.(ev)}
              role="button"
              tabIndex={0}
            >
              <EventTile event={ev} onClick={() => onEventClick?.(ev)} />
            </div>
          ))}

        {!loadingQuadrants && enrichedEvents.length === 0 && (
          <p className="text-center text-gray-400 italic text-sm py-2">
            No hi ha esdeveniments aquest dia.
          </p>
        )}
      </div>
    </section>
  )
}
