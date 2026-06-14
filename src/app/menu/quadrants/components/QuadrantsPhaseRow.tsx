'use client'

import React from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import {
  buildPendingExpandKey,
} from '@/lib/buildPendingQuadrantDraft'
import {
  buildQuadrantPhaseBadge,
  peopleFromPhase,
  quadrantStatusLabel,
} from '@/lib/quadrantsDisplayUtils'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import PendingQuadrantEditor from './PendingQuadrantEditor'
import QuadrantsPersonnelList from './QuadrantsPersonnelList'

type QuadrantDraftDetails = {
  id?: string
  vestimentModel?: string | null
  attentionNotes?: string[]
  violations?: string[]
}

type Props = {
  phase: UnifiedEvent
  rowDate: string
  hasSurvey: boolean
  isExpanded: boolean
  pendingPhases: { key: string; label: string }[]
  department: string
  onPhaseClick: (phase: UnifiedEvent) => void
  onRefreshDrafts?: () => Promise<unknown>
  onEditorSaved?: () => void | Promise<void>
}

export default function QuadrantsPhaseRow({
  phase,
  rowDate,
  hasSurvey,
  isExpanded,
  pendingPhases,
  department: _department,
  onPhaseClick,
  onRefreshDrafts: _onRefreshDrafts,
  onEditorSaved,
}: Props) {
  const draft = phase.draft as (Draft & QuadrantDraftDetails) | undefined
  const isPending = phase.quadrantStatus === 'pending'
  const phaseLabelWithDate = buildQuadrantPhaseBadge(phase, rowDate)
  const startTime = phase.displayStartTime || '--:--'
  const endTime = phase.displayEndTime || '--:--'
  const horariLabel = phase.horariLabel || `${startTime} - ${endTime}`
  const vestimentModel =
    String((phase as UnifiedEvent & { vestimentModel?: string }).vestimentModel || '').trim() ||
    String(draft?.vestimentModel || '').trim() ||
    '—'

  const draftAttention = draft && Array.isArray(draft.attentionNotes) ? draft.attentionNotes : []
  const draftViolations = draft && Array.isArray(draft.violations) ? draft.violations : []
  const hasOverlapWarning =
    draftAttention.some((n) => n.includes('ja està assignat')) ||
    draftViolations.includes('person_double_booked')

  const dotClass =
    phase.quadrantStatus === 'confirmed'
      ? 'bg-green-500'
      : phase.quadrantStatus === 'draft'
      ? 'bg-blue-500'
      : 'bg-yellow-400'

  const people = peopleFromPhase(phase)
  const responsablePerson = people.find((person) => person.role === 'responsable')
  const teamPeople = people.filter((person) => person.role !== 'responsable')

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-b border-slate-100 transition hover:bg-indigo-50/40',
          isExpanded && 'bg-indigo-50/60'
        )}
        onClick={() => onPhaseClick(phase)}
      >
        <td className="p-2.5">
          {phaseLabelWithDate ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {phaseLabelWithDate}
            </span>
          ) : (
            '—'
          )}
        </td>
        <td className={cn('p-2.5 font-medium text-slate-900', typography('bodySm'))}>
          {responsablePerson ? (
            <QuadrantsPersonnelList people={[responsablePerson]} />
          ) : (
            '—'
          )}
        </td>
        <td className={cn('p-2.5 text-slate-800', typography('bodySm'))}>
          <div className="flex items-center gap-2">
            {teamPeople.length > 0 ? (
              <QuadrantsPersonnelList people={teamPeople} />
            ) : (
              <span>—</span>
            )}
            {hasSurvey ? (
              <span
                className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                title="Sondeig enviat"
              >
                <CheckCircle2 className="mr-0.5 h-3 w-3" />
                Sondeig
              </span>
            ) : null}
          </div>
        </td>
        <td className={cn('p-2.5 font-medium text-slate-900', typography('bodySm'))}>
          {horariLabel}
        </td>
        <td className={cn('p-2.5 text-slate-700', typography('bodySm'))}>{vestimentModel}</td>
        <td className="p-2.5">
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
              <span className="text-slate-500">
                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            ) : null}
            <span className={cn('inline-block h-3 w-3 rounded-full', dotClass)} />
            <span className={cn('text-slate-600', typography('bodyXs'))}>
              {quadrantStatusLabel(phase.quadrantStatus)}
            </span>
          </div>
        </td>
      </tr>

      {isExpanded && (isPending || draft) ? (
        <tr>
          <td colSpan={6} className="bg-slate-50/80 px-3 pb-3 pt-1">
            <PendingQuadrantEditor phase={phase} onSaved={onEditorSaved} />
          </td>
        </tr>
      ) : null}
    </>
  )
}
