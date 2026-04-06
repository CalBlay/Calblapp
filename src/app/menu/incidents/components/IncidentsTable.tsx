// file: src/app/menu/incidents/components/IncidentsTable.tsx
'use client'

import React, { useState } from 'react'
import IncidentsEventGroup from './IncidentsEventGroup'
import IncidentOperationsDialog from './IncidentOperationsDialog'
import { Incident } from '@/hooks/useIncidents'
import { formatDateString } from '@/lib/formatDate'
import { groupIncidentsByDayAndEvent } from '@/lib/incidentsMeetingMinutes'

interface Props {
  incidents: Incident[]
  onUpdate: (id: string, data: Partial<Incident>) => Promise<unknown>
}

const formatDayCountLabel = (count: number) =>
  count === 1 ? '1 incid.' : `${count} inc.`

export default function IncidentsTable({ incidents, onUpdate }: Props) {
  const [opsIncident, setOpsIncident] = useState<Incident | null>(null)

  const dayEntries = groupIncidentsByDayAndEvent(incidents)

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      <IncidentOperationsDialog
        incident={opsIncident}
        open={Boolean(opsIncident)}
        onClose={() => setOpsIncident(null)}
        onIncidentPatch={onUpdate}
      />
      {dayEntries.map(({ day, events, totalCount }) => (
        <div key={day}>
          <div className="px-4 py-3 bg-slate-200 border-b border-slate-300 text-base font-semibold text-slate-800 flex items-center justify-between gap-3">
            <span>{formatDateString(day) ?? 'Sense data'}</span>
            <span className="text-xs font-semibold tracking-wide text-rose-700 bg-rose-100 px-3 py-0.5 rounded-full border border-rose-200">
              {formatDayCountLabel(totalCount)}
            </span>
          </div>

          {events.map((event, i: number) => (
            <IncidentsEventGroup
              key={i}
              event={event}
              onUpdate={onUpdate}
              onOpenOperations={setOpsIncident}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
