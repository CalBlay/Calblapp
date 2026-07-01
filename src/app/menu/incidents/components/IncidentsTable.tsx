// file: src/app/menu/incidents/components/IncidentsTable.tsx
'use client'

import React, { useState } from 'react'
import { AlertTriangle, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import IncidentsEventGroup from './IncidentsEventGroup'
import IncidentImagesDialog from './IncidentImagesDialog'
import { Incident } from '@/hooks/useIncidents'
import { groupIncidentsByDayAndEvent, type IncidentDaySort } from '@/lib/incidentsMeetingMinutes'

interface Props {
  incidents: Incident[]
  /** Amb rang de dates: primer dia del període a dalt; sense dates: proximitat a avui. */
  daySort?: IncidentDaySort
  onUpdate: (id: string, data: Partial<Incident>) => Promise<unknown>
  onDelete: (incident: Incident) => void
  canDeleteIncident: (incident: Incident) => boolean
  canEditCategory: boolean
  categoryOptions: Array<{ id: string; label: string }>
}

function formatDayLabel(day: string) {
  if (!day) return 'Sense data'
  const parsed = parseISO(day)
  if (Number.isNaN(parsed.getTime())) return day
  return format(parsed, 'dd/MM/yyyy', { locale: ca })
}

function formatEventCountLabel(count: number) {
  return count === 1 ? '1 esdeveniment' : `${count} esdeveniments`
}

function formatIncidentCountLabel(count: number) {
  return count === 1 ? '1 incidència' : `${count} incidències`
}

export default function IncidentsTable({
  incidents,
  daySort = 'chronological',
  onUpdate,
  onDelete,
  canDeleteIncident,
  canEditCategory,
  categoryOptions,
}: Props) {
  const [imagesIncident, setImagesIncident] = useState<Incident | null>(null)

  const dayEntries = groupIncidentsByDayAndEvent(incidents, daySort)

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:rounded-xl">
      <IncidentImagesDialog
        incident={imagesIncident}
        open={Boolean(imagesIncident)}
        onClose={() => setImagesIncident(null)}
      />

      <div className="space-y-6 p-3 sm:space-y-7 sm:p-4 lg:space-y-6 lg:p-4">
        {dayEntries.map(({ day, events, totalCount }) => (
          <section
            key={day || 'sense-data'}
            className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-inner sm:p-4"
          >
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 shadow-sm lg:mb-1.5 lg:px-2.5 lg:py-1.5">
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight text-gray-800 sm:text-base">
                {formatDayLabel(day)}
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-[3px] text-xs font-semibold text-purple-700 sm:text-sm">
                  <Calendar className="h-3 w-3" aria-hidden />
                  {formatEventCountLabel(events.length)}
                </span>
              </h2>

              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-[3px] text-xs font-semibold text-rose-700 sm:text-sm">
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                {formatIncidentCountLabel(totalCount)}
              </span>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event, i) => (
                <IncidentsEventGroup
                  key={`${day}-${event.eventId || event.rows[0]?.eventId || i}`}
                  event={event}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onOpenImages={setImagesIncident}
                  canDeleteIncident={canDeleteIncident}
                  canEditCategory={canEditCategory}
                  categoryOptions={categoryOptions}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
