'use client'

import React from 'react'
import EventCard from './EventCard'
import { Users, Calendar } from 'lucide-react'
import { addDays, format, isAfter, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'

export interface EventData {
  id: string
  summary: string
  pax?: number | string
  start: string
  end: string | null
  day?: string
  occurrenceKey?: string
  location?: string
  locationShort?: string
  lnKey?: 'empresa' | 'casaments' | 'foodlovers' | 'agenda' | 'altres'
  lnLabel?: string
  responsableName?: string
  eventCode?: string | null
  state?: string
  commercial?: string | null
  chatUnread?: number
  canChat?: boolean
  horaInici?: string
  lastAviso?: {
    content: string
    department: string
    createdAt: string
  } | null
}

interface Props {
  date: string
  events: EventData[]
  onEventClick?: (ev: EventData, mode?: 'menu' | 'avisos') => void
  onEventChat?: (ev: EventData) => void
  isAdmin?: boolean
}

export default function EventsDayGroup({ date, events, onEventClick, onEventChat, isAdmin }: Props) {
  const totalPax = events.reduce((sum, e) => sum + (Number(e.pax) || 0), 0)
  const totalEvents = events.length
  const sortedEvents = [...events].sort((a, b) => {
    const hA = (a.horaInici || '').trim()
    const hB = (b.horaInici || '').trim()
    if (!hA && !hB) return 0
    if (!hA) return 1
    if (!hB) return -1
    return hA.localeCompare(hB)
  })

  return (
    <section className="mb-3 last:mb-0 lg:mb-2">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 shadow-sm lg:mb-1.5 lg:px-2.5 lg:py-1.5">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight text-gray-800 sm:text-base">
          {format(parseISO(date), 'dd/MM/yyyy', { locale: ca })}
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-[3px] text-xs font-semibold text-purple-700 sm:text-sm">
            <Calendar className="h-3 w-3" />
            {totalEvents} esdeveniments
          </span>
        </h2>

        <span className="flex items-center gap-1 text-sm font-semibold text-pink-600 sm:text-base">
          <Users className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
          {totalPax} pax
        </span>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {sortedEvents.map(event => (
          <EventCard
            key={event.occurrenceKey || `${event.id}-${event.day || event.start.slice(0, 10)}`}
            event={event}
            variant="grid"
            onOpenMenu={() => onEventClick?.(event, 'menu')}
            onOpenAvisos={() => onEventClick?.(event, 'avisos')}
            onOpenChat={() => onEventChat?.(event)}
            showChat={(() => {
              const code = String(event.eventCode || '').trim()
              const commercial = String(event.commercial || '').trim()
              if (!code || !commercial) return false
              if (isAdmin) return true
              if (!event.canChat) return false
              const endRaw = String(event.end || event.start || '').trim()
              if (!endRaw) return true
              const endDate = parseISO(endRaw)
              if (Number.isNaN(endDate.getTime())) return true
              const visibleUntil = addDays(endDate, 1)
              return !isAfter(new Date(), visibleUntil)
            })()}
          />
        ))}
      </div>
    </section>
  )
}
