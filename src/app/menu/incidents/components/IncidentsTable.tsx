// file: src/app/menu/incidents/components/IncidentsTable.tsx
'use client'

import React from 'react'
import IncidentsEventGroup from './IncidentsEventGroup'
import { Incident } from '@/hooks/useIncidents'
import { formatDateString } from '@/lib/formatDate'

interface Props {
  incidents: Incident[]
  onUpdate: (id: string, data: Partial<Incident>) => void
}

type GroupedIncidentEvent = {
  eventTitle?: string
  eventCode?: string
  ln?: string
  location?: string
  serviceType?: string
  pax?: number
  fincaId?: string
  commercial: string
  rows: Incident[]
}

const formatDayCountLabel = (count: number) =>
  count === 1 ? '1 incid.' : `${count} inc.`

export default function IncidentsTable({ incidents, onUpdate }: Props) {
  const days = incidents.reduce<Record<string, Record<string, GroupedIncidentEvent>>>((acc, inc) => {
    const day = (inc.eventDate || '').slice(0, 10)
    if (!acc[day]) acc[day] = {}
    const key = inc.eventId || 'no-event'

    if (!acc[day][key]) {
      acc[day][key] = {
        eventTitle: inc.eventTitle,
        eventCode: inc.eventCode,
        ln: inc.ln,
        location: inc.eventLocation,
        serviceType: inc.serviceType,
        pax: inc.pax,
        fincaId: inc.fincaId,
        commercial: inc.eventCommercial || '',
        rows: [],
      }
    }

    acc[day][key].rows.push(inc)
    return acc
  }, {})

  const sortedDays = Object.keys(days).sort()
  const dayEntries = sortedDays.map((day) => {
    const events = Object.values(days[day] || {})
    const totalCount = events.reduce(
      (sum: number, event) => sum + event.rows.length,
      0
    )

    return { day, events, totalCount }
  })

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      {dayEntries.map(({ day, events, totalCount }) => (
        <div key={day}>
          <div className="px-4 py-3 bg-slate-200 border-b border-slate-300 text-base font-semibold text-slate-800 flex items-center justify-between gap-3">
            <span>{formatDateString(day) ?? 'Sense data'}</span>
            <span className="text-xs font-semibold tracking-wide text-rose-700 bg-rose-100 px-3 py-0.5 rounded-full border border-rose-200">
              {formatDayCountLabel(totalCount)}
            </span>
          </div>

          {events.map((event, i: number) => (
            <IncidentsEventGroup key={i} event={event} onUpdate={onUpdate} />
          ))}
        </div>
      ))}
    </div>
  )
}
