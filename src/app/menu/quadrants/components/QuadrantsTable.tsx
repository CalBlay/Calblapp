'use client'

import React from 'react'
import { Calendar, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import type { GroupedQuadrantDay } from '@/lib/quadrantsGrouping'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import QuadrantsEventGroup from './QuadrantsEventGroup'

type Props = {
  groupedDays: GroupedQuadrantDay[]
  surveyKeySet: Set<string>
  phasesByEventId: Record<string, Set<string>>
  phaseOptions: { key: string; label: string }[]
  expandedId: string | null
  onExpandedIdChange: (id: string | null) => void
  department: string
  onCreatePhase?: (phaseKey: string, phase: UnifiedEvent) => void
  onRefreshDrafts?: () => Promise<unknown>
}

function formatDayLabel(day: string) {
  if (!day) return 'Sense data'
  try {
    return format(parseISO(day), 'dd/MM/yyyy', { locale: ca })
  } catch {
    return day
  }
}

function formatEventCountLabel(count: number) {
  return count === 1 ? '1 esdeveniment' : `${count} esdeveniments`
}

export default function QuadrantsTable({
  groupedDays,
  surveyKeySet,
  phasesByEventId,
  phaseOptions,
  expandedId,
  onExpandedIdChange,
  department,
  onCreatePhase,
  onRefreshDrafts,
}: Props) {
  return (
    <section
      id="quadrants-print-root"
      className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:rounded-xl"
    >
      <div className="space-y-6 p-3 sm:space-y-7 sm:p-4 lg:space-y-6 lg:p-4">
        {groupedDays.map(({ day, events, totalPax }) => (
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

              <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-[3px] text-xs font-semibold text-fuchsia-700 sm:text-sm">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                {totalPax} pax
              </span>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event, i) => (
                <QuadrantsEventGroup
                  key={`${day}-${event.eventId || i}`}
                  event={event}
                  day={day}
                  surveyKeySet={surveyKeySet}
                  phasesByEventId={phasesByEventId}
                  phaseOptions={phaseOptions}
                  expandedId={expandedId}
                  onExpandedIdChange={onExpandedIdChange}
                  department={department}
                  onCreatePhase={onCreatePhase}
                  onRefreshDrafts={onRefreshDrafts}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
