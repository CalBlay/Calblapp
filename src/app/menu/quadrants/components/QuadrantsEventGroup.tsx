'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import {
  countAssignedStaffFromPhases,
  eventStartDisplayLabel,
  getQuadrantPersonnelSummary,
} from '@/lib/quadrantsDisplayUtils'
import {
  getQuadrantEventBlockVisualStyle,
  getQuadrantEventGroupMeta,
} from '@/lib/quadrantEventGroupMeta'
import { buildPendingExpandKey } from '@/lib/buildPendingQuadrantDraft'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'
import { confirmDraftTable } from '@/app/menu/quadrants/drafts/components/draftsTableActions'
import type { GroupedQuadrantEvent } from '@/lib/quadrantsGrouping'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import QuadrantsEventHeader from './QuadrantsEventHeader'
import QuadrantsPhaseRow from './QuadrantsPhaseRow'
import PendingQuadrantEditor from './PendingQuadrantEditor'
import QuadrantCard from '@/app/menu/quadrants/drafts/components/QuadrantCard'

type Props = {
  event: GroupedQuadrantEvent
  day: string
  surveyKeySet: Set<string>
  phasesByEventId: Record<string, Set<string>>
  phaseOptions: { key: string; label: string }[]
  expandedId: string | null
  onExpandedIdChange: (id: string | null) => void
  department: string
  onCreatePhase?: (phaseKey: string, phase: UnifiedEvent) => void
  onRefreshDrafts?: () => Promise<unknown>
}

export default function QuadrantsEventGroup({
  event,
  day,
  surveyKeySet,
  phasesByEventId,
  phaseOptions,
  expandedId,
  onExpandedIdChange,
  department,
  onRefreshDrafts,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const { ready, canViewPath, hasAction } = useUiPermissions()
  const canConfirm =
    ready && canViewPath('/menu/quadrants') && hasAction(PERM.action('/menu/quadrants', 'confirm'))

  const hasSurvey = useMemo(() => {
    const eventId = event.eventId.split('__')[0]
    return event.phases.some((phase) => {
      const key = `${eventId}__${String(phase.phaseDate || phase.start || '').slice(0, 10)}`
      return surveyKeySet.has(key)
    })
  }, [event.eventId, event.phases, surveyKeySet])

  const meta = useMemo(
    () => getQuadrantEventGroupMeta(event.phases, { hasSurvey }),
    [event.phases, hasSurvey]
  )

  const blockVisual = useMemo(
    () => getQuadrantEventBlockVisualStyle(meta, expanded),
    [meta, expanded]
  )

  const personnel = useMemo(
    () => getQuadrantPersonnelSummary(event.phases, day),
    [event.phases, day]
  )

  const assignedStaffCount = useMemo(
    () => countAssignedStaffFromPhases(event.phases),
    [event.phases]
  )

  const draftPhases = useMemo(
    () =>
      event.phases.filter(
        (phase) => phase.quadrantStatus === 'draft' && phase.draft
      ),
    [event.phases]
  )

  const showConfirm = canConfirm && draftPhases.length > 0

  const handleConfirm = async () => {
    if (!showConfirm || confirmLoading) return
    setConfirmLoading(true)
    try {
      let confirmed = 0
      for (const phase of draftPhases) {
        const ok = await confirmDraftTable({
          draft: phase.draft as Draft,
          onConfirmed: () => {},
          silent: true,
        })
        if (ok) confirmed += 1
      }
      if (confirmed > 0) {
        toast.success(
          confirmed === 1
            ? 'Quadrant confirmat correctament'
            : `${confirmed} quadrants confirmats correctament`
        )
        await onRefreshDrafts?.()
      }
    } finally {
      setConfirmLoading(false)
    }
  }

  const existingPhases = phasesByEventId[event.eventId]
  const pendingPhaseStartLbl = event.phases[0]
    ? eventStartDisplayLabel(event.phases[0])
    : ''

  const pendingPhasesForEvent = phaseOptions
    .filter((p) => !(existingPhases && existingPhases.has(p.key)))
    .map((p) => ({
      key: p.key,
      label:
        p.key !== 'event' && pendingPhaseStartLbl
          ? `${p.label} (${pendingPhaseStartLbl})`
          : p.label,
    }))

  const pendingPhases = useMemo(
    () => event.phases.filter((phase) => phase.quadrantStatus === 'pending'),
    [event.phases]
  )

  const managedPhases = useMemo(
    () => event.phases.filter((phase) => phase.quadrantStatus !== 'pending'),
    [event.phases]
  )

  const activePendingPhase = useMemo(() => {
    if (pendingPhases.length === 0) return null
    const matched = pendingPhases.find(
      (phase) => expandedId === buildPendingExpandKey(phase)
    )
    return matched ?? pendingPhases[0]
  }, [pendingPhases, expandedId])

  const activeDraftPhase = useMemo(() => {
    return (
      managedPhases.find((phase) => {
        const draft = phase.draft as { id?: string } | null | undefined
        return draft?.id && expandedId === draft.id
      }) ?? null
    )
  }, [managedPhases, expandedId])

  const handleEditorSaved = useCallback(async () => {
    setExpanded(false)
    onExpandedIdChange(null)
  }, [onExpandedIdChange])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)

    if (next) {
      if (pendingPhases[0]) {
        onExpandedIdChange(buildPendingExpandKey(pendingPhases[0]))
        return
      }

      const firstDraft = managedPhases.find((phase) => {
        const draft = phase.draft as { id?: string } | null | undefined
        return Boolean(draft?.id)
      })
      const draftId = (firstDraft?.draft as { id?: string } | undefined)?.id
      onExpandedIdChange(draftId ?? null)
      return
    }

    onExpandedIdChange(null)
  }

  const handlePhaseClick = (phase: UnifiedEvent) => {
    const draft = phase.draft as { id?: string } | null | undefined
    if (phase.quadrantStatus === 'pending') return
    if (draft?.id) {
      onExpandedIdChange(expandedId === draft.id ? null : draft.id)
    }
  }

  const showDirectPendingEditor = expanded && pendingPhases.length > 0
  const showManagedTable = expanded && managedPhases.length > 0

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border border-l-4 transition-all duration-200',
        blockVisual.accent,
        blockVisual.shell,
        expanded && 'col-span-full',
        !expanded && 'h-full'
      )}
      style={
        expanded
          ? undefined
          : ({
              contentVisibility: 'auto',
              containIntrinsicSize: 'auto 220px',
            } as React.CSSProperties)
      }
    >
      <QuadrantsEventHeader
        className={!expanded ? 'h-full' : undefined}
        headerClassName={blockVisual.header}
        title={event.summary}
        code={event.eventCode}
        ln={event.ln}
        location={event.location}
        commercial={event.commercial}
        service={event.service}
        pax={event.numPax}
        meta={meta}
        personnel={personnel}
        assignedStaffCount={assignedStaffCount}
        showConfirm={showConfirm}
        confirmLoading={confirmLoading}
        expanded={expanded}
        hidePersonnel={expanded}
        onToggle={handleToggle}
        onConfirm={() => void handleConfirm()}
      />

      {expanded ? (
        <div className={cn('min-w-0', blockVisual.body)}>
          {showDirectPendingEditor && activePendingPhase ? (
            <div className="border-t border-slate-200/80 p-1.5">
              {pendingPhases.length > 1 ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {pendingPhases.map((phase) => {
                    const key = buildPendingExpandKey(phase)
                    const label =
                      phase.phaseBadgeLabel ||
                      String(phase.phaseLabel || phase.phaseType || 'Event').toUpperCase()
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onExpandedIdChange(key)}
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition',
                          expandedId === key
                            ? 'bg-amber-200 text-amber-950'
                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <PendingQuadrantEditor phase={activePendingPhase} onSaved={handleEditorSaved} />
            </div>
          ) : null}

          {showManagedTable ? (
            <div className="overflow-x-auto p-1.5">
              {activeDraftPhase?.draft ? (
                <div>
                  <QuadrantCard
                    quadrant={activeDraftPhase.draft as Draft}
                    phase={activeDraftPhase}
                    pendingPhases={pendingPhasesForEvent}
                    onRefreshDrafts={onRefreshDrafts}
                    onSaved={handleEditorSaved}
                  />
                </div>
              ) : null}

              {managedPhases.length > 1 || !activeDraftPhase ? (
                <table className={cn('w-full min-w-[640px] table-fixed', typography('bodySm'))}>
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="w-28 p-2 text-left text-xs font-semibold">Fase</th>
                      <th className="w-28 p-2 text-left text-xs font-semibold">Responsable</th>
                      <th className="p-2 text-left text-xs font-semibold">Equip</th>
                      <th className="w-28 p-2 text-left text-xs font-semibold">Horari</th>
                      <th className="w-24 p-2 text-left text-xs font-semibold">Estat</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {managedPhases.map((phase, idx) => {
                      const draft = phase.draft as { id?: string } | null | undefined
                      const rowDate = phase.start ? phase.start.slice(0, 10) : day
                      const eventId = event.eventId.split('__')[0]
                      const surveyKey = `${eventId}__${String(
                        phase.phaseDate || phase.start || ''
                      ).slice(0, 10)}`
                      const phaseHasSurvey = surveyKeySet.has(surveyKey)
                      const rowKey = `${event.eventId}__${phase.phaseKey || 'event'}__${rowDate}__${idx}`
                      const isRowExpanded = Boolean(draft?.id && expandedId === draft.id)

                      return (
                        <QuadrantsPhaseRow
                          key={rowKey}
                          phase={phase}
                          rowDate={rowDate}
                          hasSurvey={phaseHasSurvey}
                          isExpanded={isRowExpanded}
                          pendingPhases={pendingPhasesForEvent}
                          department={department}
                          onPhaseClick={handlePhaseClick}
                          onRefreshDrafts={onRefreshDrafts}
                          onEditorSaved={handleEditorSaved}
                        />
                      )
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
