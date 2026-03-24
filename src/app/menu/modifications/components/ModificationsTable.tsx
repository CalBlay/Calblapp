// file: src/app/menu/modifications/components/ModificationsTable.tsx
'use client'

import React from 'react'
import { Modification } from '@/hooks/useModifications'
import ModificationsEventGroup from './ModificationsEventGroup'
import { formatDateString } from '@/lib/formatDate'
import { Edit3 } from 'lucide-react'

interface Props {
  modifications: Modification[]
  onUpdate: (id: string, data: Partial<Modification>) => Promise<any> | void
  onDelete: (id: string) => Promise<any> | void
  currentUserId?: string
  currentUserName?: string
  currentUserEmail?: string
}

type DayGroupEvent = {
  eventTitle?: string
  eventCode?: string
  location?: string
  commercial?: string
  count: number
  rows: Modification[]
}

export default function ModificationsTable({
  modifications,
  onUpdate,
  onDelete,
  currentUserId,
  currentUserName,
  currentUserEmail,
}: Props) {
  // Agrupació per dia -> esdeveniment
  const days = modifications.reduce((acc: Record<string, Record<string, DayGroupEvent>>, mod) => {
    const day = (mod.eventDate || mod.createdAt || '').slice(0, 10)
    if (!acc[day]) acc[day] = {}
    const key = mod.eventId || 'no-event'

    if (!acc[day][key]) {
      acc[day][key] = {
        eventTitle: mod.eventTitle,
        eventCode: mod.eventCode,
        location: mod.eventLocation,
        commercial: mod.eventCommercial,
        count: 0,
        rows: [] as Modification[],
      }
    }

    acc[day][key].rows.push(mod)
    acc[day][key].count += 1
    return acc
  }, {} as Record<string, Record<string, DayGroupEvent>>)

  const sortedDays = Object.keys(days).sort()
  const dayEntries = sortedDays.map((day) => {
    const events = Object.values(days[day] || {})
    const totalCount = events.reduce(
      (sum: number, event) => sum + (event.count || 0),
      0
    )
    return { day, events, totalCount }
  })

  const formatDayCountLabel = (count: number) =>
    count === 1 ? '1 mod.' : `${count} mods.`

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      {dayEntries.map(({ day, events, totalCount }) => (
        <div key={day}>
            <div className="px-4 py-3 bg-slate-200 border-b border-slate-300 text-base font-semibold text-slate-800 flex items-center justify-between gap-4">
              <span className="text-base leading-tight">
                {formatDateString(day) ?? 'Sense data'}
              </span>
              <span className="text-xs font-semibold tracking-wide text-rose-700 bg-rose-100 px-3 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                <Edit3 className="h-3 w-3" aria-hidden />
                <span>{formatDayCountLabel(totalCount)}</span>
              </span>
          </div>

          {events.map((event, i: number) => (
            <ModificationsEventGroup
              key={i}
              event={event}
              onUpdate={onUpdate}
              onDelete={onDelete}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
