'use client'

import React from 'react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildQuadrantPhaseBadge,
  eventStartDisplayLabel,
  peopleFromPhase,
} from '@/lib/quadrantsDisplayUtils'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import { buildPendingExpandKey } from '@/lib/buildPendingQuadrantDraft'
import PendingQuadrantEditor from './PendingQuadrantEditor'
import QuadrantsPersonnelList from './QuadrantsPersonnelList'

type QuadrantDraftDetails = {
  id?: string
  vestimentModel?: string | null
  attentionNotes?: string[]
  violations?: string[]
}

type Props = {
  groupedByDay: [string, UnifiedEvent[]][]
  surveyKeySet: Set<string>
  phasesByEventId: Record<string, Set<string>>
  phaseOptions: { key: string; label: string }[]
  expandedId: string | null
  onExpandedIdChange: (id: string | null) => void
  department: string
  onRefreshDrafts?: () => Promise<unknown>
}

export default function QuadrantsLinesTable({
  groupedByDay,
  surveyKeySet,
  phasesByEventId,
  phaseOptions,
  expandedId,
  onExpandedIdChange,
  department,
  onRefreshDrafts: _onRefreshDrafts,
}: Props) {
  return (
    <div
      id="quadrants-print-root"
      className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:rounded-xl"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">Esdeveniment</th>
              <th className="px-3 py-2">LN</th>
              <th className="px-3 py-2">PAX</th>
              <th className="px-3 py-2">Ubicació</th>
              <th className="px-3 py-2">Servei</th>
              <th className="px-3 py-2">Vestiment</th>
              <th className="px-3 py-2">Inici</th>
              <th className="px-3 py-2">Personal</th>
              <th className="px-3 py-2">Horari</th>
              <th className="px-3 py-2 text-center">Estat</th>
            </tr>
          </thead>
          <tbody>
            {groupedByDay.map(([day, evs]) => (
              <React.Fragment key={day}>
                <tr className="bg-transparent">
                  <td colSpan={12} className="px-2 py-2">
                    <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
                      <div className="text-base font-semibold leading-none tracking-tight text-slate-700">
                        {format(parseISO(day), 'dd/MM/yyyy', { locale: ca })}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-violet-100/80 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                          {evs.length} {evs.length === 1 ? 'fila' : 'files'}
                        </div>
                        <div className="rounded-full bg-fuchsia-100/80 px-2.5 py-1 text-[11px] font-medium text-fuchsia-700">
                          {evs.reduce((sum, item) => sum + Number(item.numPax || 0), 0)} pax
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>

                {evs.map((ev, evIdx) => {
                  const draft = ev.draft as (Draft & QuadrantDraftDetails) | undefined
                  const dotClass =
                    ev.quadrantStatus === 'confirmed'
                      ? 'bg-green-500'
                      : ev.quadrantStatus === 'draft'
                      ? 'bg-blue-500'
                      : 'bg-yellow-400'

                  const startTime = ev.displayStartTime || '--:--'
                  const endTime = ev.displayEndTime || '--:--'
                  const horariLabel = ev.horariLabel || `${startTime} - ${endTime}`
                  const rowDate = ev.start ? ev.start.slice(0, 10) : ''
                  const phaseLabelWithDate = buildQuadrantPhaseBadge(ev, rowDate)
                  const eventId = String(ev.eventId || ev.eventCode || ev.code || ev.id || '').trim()
                  const surveyKey = `${eventId.split('__')[0]}__${String(
                    ev.phaseDate || ev.start || ''
                  ).slice(0, 10)}`
                  const hasSurvey = surveyKeySet.has(surveyKey)
                  const existingPhases = eventId ? phasesByEventId[eventId] : undefined
                  const pendingPhaseStartLbl = eventStartDisplayLabel(ev)
                  const _pendingPhases = eventId
                    ? phaseOptions
                        .filter((p) => !(existingPhases && existingPhases.has(p.key)))
                        .map((p) => ({
                          key: p.key,
                          label:
                            p.key !== 'event' && pendingPhaseStartLbl
                              ? `${p.label} (${pendingPhaseStartLbl})`
                              : p.label,
                        }))
                    : []

                  const fragmentKey = `${eventId || ev.id || ''}__${
                    ev.phaseKey || ev.phaseType || ev.phaseLabel || 'event'
                  }__${ev.phaseDate || ev.start || ''}__${ev.id || 'row'}__${evIdx}`
                  const pendingKey = buildPendingExpandKey(ev)
                  const isPending = ev.quadrantStatus === 'pending'
                  const isExpanded =
                    (draft?.id != null && expandedId === draft.id) ||
                    (isPending && expandedId === pendingKey)
                  const draftAttention =
                    draft && Array.isArray(draft.attentionNotes) ? draft.attentionNotes : []
                  const draftViolations: string[] =
                    draft && Array.isArray(draft.violations) ? draft.violations : []
                  const hasOverlapWarning =
                    draftAttention.some((n) => n.includes('ja està assignat')) ||
                    draftViolations.includes('person_double_booked')
                  const vestimentModel =
                    String((ev as UnifiedEvent & { vestimentModel?: string }).vestimentModel || '').trim() ||
                    String(draft?.vestimentModel || '').trim() ||
                    '—'
                  const people = peopleFromPhase(ev)
                  const responsablePerson = people.find((person) => person.role === 'responsable')

                  return (
                    <React.Fragment key={fragmentKey}>
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-slate-100 transition hover:bg-indigo-50/40',
                          isExpanded && 'bg-indigo-50/60'
                        )}
                        onClick={() => {
                          if (isPending) {
                            onExpandedIdChange(expandedId === pendingKey ? null : pendingKey)
                          } else if (draft && draft.id) {
                            onExpandedIdChange(expandedId === draft.id ? null : draft.id)
                          }
                        }}
                      >
                        <td className="px-3 py-2.5 font-semibold text-slate-900">
                          {responsablePerson ? (
                            <QuadrantsPersonnelList people={[responsablePerson]} />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {phaseLabelWithDate ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              {phaseLabelWithDate}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-[15px] font-semibold tracking-tight text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{ev.summary}</span>
                            {hasSurvey ? (
                              <span
                                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                                title="Sondeig enviat"
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Sondeig
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{ev.ln || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{ev.numPax ?? '—'}</td>
                        <td className="px-3 py-2.5 text-slate-700">{ev.location || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-800">{ev.service || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-800">{vestimentModel}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{startTime}</td>
                        <td className="px-3 py-2.5 text-slate-800">
                          <QuadrantsPersonnelList
                            people={people.filter((person) => person.role !== 'responsable')}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{horariLabel}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex items-center gap-2">
                            {hasOverlapWarning ? (
                              <span
                                className="text-amber-600"
                                title={draftAttention[0] || 'Possible solapament de personal'}
                              >
                                <AlertTriangle className="h-4 w-4" aria-hidden />
                              </span>
                            ) : null}
                            {draft?.id || isPending ? (
                              <span className="text-slate-600">
                                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </span>
                            ) : null}
                            <span className={cn('inline-block h-3 w-3 rounded-full', dotClass)} />
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (isPending || draft) ? (
                        <tr>
                          <td colSpan={12} className="bg-slate-50/80 px-3 pb-3 pt-1">
                            <PendingQuadrantEditor
                              phase={ev}
                              department={department}
                              onSaved={() => onExpandedIdChange(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
