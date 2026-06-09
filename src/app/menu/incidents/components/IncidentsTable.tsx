// file: src/app/menu/incidents/components/IncidentsTable.tsx
'use client'

import React, { useState } from 'react'
import IncidentsEventGroup from './IncidentsEventGroup'
import IncidentImagesDialog from './IncidentImagesDialog'
import { Incident } from '@/hooks/useIncidents'
import { formatDateString } from '@/lib/formatDate'
import { groupIncidentsByDayAndEvent, type IncidentDaySort } from '@/lib/incidentsMeetingMinutes'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface Props {
  incidents: Incident[]
  /** Amb rang de dates: primer dia del període a dalt; sense dates: proximitat a avui. */
  daySort?: IncidentDaySort
  onUpdate: (id: string, data: Partial<Incident>) => Promise<unknown>
  onDelete: (incident: Incident) => void
  canDeleteIncident: (incident: Incident) => boolean
}

const formatDayCountLabel = (count: number) =>
  count === 1 ? '1 incid.' : `${count} inc.`

export default function IncidentsTable({
  incidents,
  daySort = 'chronological',
  onUpdate,
  onDelete,
  canDeleteIncident,
}: Props) {
  const [imagesIncident, setImagesIncident] = useState<Incident | null>(null)

  const dayEntries = groupIncidentsByDayAndEvent(incidents, daySort)

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      <IncidentImagesDialog
        incident={imagesIncident}
        open={Boolean(imagesIncident)}
        onClose={() => setImagesIncident(null)}
      />
      {dayEntries.map(({ day, events, totalCount }) => (
        <div key={day}>
          <div
            className={cn(
              'px-4 py-3 bg-slate-200 border-b border-slate-300 flex items-center justify-between gap-3',
              typography('cardTitle'),
              'text-slate-800'
            )}
          >
            <span>{formatDateString(day) ?? 'Sense data'}</span>
            <span
              className={cn(
                typography('bodyXs'),
                'font-semibold tracking-wide text-rose-700 bg-rose-100 px-3 py-0.5 rounded-full border border-rose-200'
              )}
            >
              {formatDayCountLabel(totalCount)}
            </span>
          </div>

          {events.map((event, i: number) => (
            <IncidentsEventGroup
              key={i}
              event={event}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onOpenImages={setImagesIncident}
              canDeleteIncident={canDeleteIncident}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
