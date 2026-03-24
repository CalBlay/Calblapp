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
  location?: string
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

  return (
    <section className="mb-4">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 shadow-sm">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight text-gray-800">
          {format(parseISO(date), 'dd/MM/yyyy', { locale: ca })}
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-[3px] text-xs font-semibold text-purple-700">
            <Calendar className="h-3 w-3" />
            {totalEvents} esdeveniments
          </span>
        </h2>

        <span className="flex items-center gap-1 text-xs font-semibold text-pink-600 sm:text-sm">
          <Users className="h-4 w-4" />
          {totalPax} pax
        </span>
      </header>

      <div className="flex flex-col gap-2.5">
        {events.map(event => (
          <div
            key={event.id}
            className="relative"
            role="button"
            tabIndex={0}
            onClick={() => onEventClick?.(event, 'menu')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onEventClick?.(event, 'menu')
              }
            }}
          >
            <EventCard
              event={event}
              onOpenMenu={() => onEventClick?.(event, 'menu')}
              onOpenAvisos={() => onEventClick?.(event, 'avisos')}
              onOpenChat={() => onEventChat?.(event)}
              showChat={(() => {
                const code = String((event as any).eventCode || '').trim()
                const commercial = String((event as any).commercial || '').trim()
                if (!code || !commercial) return false
                if (isAdmin) return true
                if (!event.canChat) return false
                const endRaw = String((event as any).end || (event as any).start || '').trim()
                if (!endRaw) return true
                const endDate = parseISO(endRaw)
                if (Number.isNaN(endDate.getTime())) return true
                const visibleUntil = addDays(endDate, 1)
                return !isAfter(new Date(), visibleUntil)
              })()}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
