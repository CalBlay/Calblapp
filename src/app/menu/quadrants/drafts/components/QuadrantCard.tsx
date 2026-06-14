'use client'

import React, { useMemo, useState } from 'react'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import { QuadrantEditor } from '@/app/menu/quadrants/[id]/components/QuadrantModal'
import {
  draftToQuadrantEvent,
  unifiedPhaseToQuadrantEvent,
} from '@/lib/unifiedPhaseToQuadrantEvent'
import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'

interface Props {
  quadrant: Draft
  phase?: UnifiedEvent
  autoExpand?: boolean
  pendingPhases?: Array<{ key: string; label: string }>
  onCreatePhase?: (phaseKey: string) => void
  onRefreshDrafts?: () => Promise<unknown>
  onSaved?: () => void | Promise<void>
}

type DraftWithMeta = Draft & {
  phaseType?: string | null
  phaseLabel?: string | null
  attentionNotes?: string[]
}

export default function QuadrantCard({
  quadrant,
  phase,
  autoExpand = false,
  pendingPhases: _pendingPhases = [],
  onCreatePhase: _onCreatePhase,
  onRefreshDrafts,
  onSaved,
}: Props) {
  void autoExpand
  void onRefreshDrafts
  void _pendingPhases
  void _onCreatePhase
  const [creatingPhaseKey, setCreatingPhaseKey] = useState<string | null>(null)
  const draftWithMeta = quadrant as DraftWithMeta

  const editorEvent = useMemo(() => {
    if (creatingPhaseKey && phase) {
      return unifiedPhaseToQuadrantEvent({
        ...phase,
        phaseKey: creatingPhaseKey,
        phaseType: creatingPhaseKey,
      })
    }
    if (phase) return unifiedPhaseToQuadrantEvent(phase)
    return draftToQuadrantEvent(quadrant)
  }, [creatingPhaseKey, phase, quadrant])

  const editorKey = creatingPhaseKey
    ? `${editorEvent.id}-${creatingPhaseKey}-${editorEvent.start?.slice(0, 10) || 'nodate'}`
    : `${editorEvent.id}-${editorEvent.phaseKey || 'event'}-${editorEvent.start?.slice(0, 10) || 'nodate'}`

  return (
    <div>
      {Array.isArray(draftWithMeta.attentionNotes) &&
        draftWithMeta.attentionNotes.length > 0 && (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            role="alert"
          >
            <div className="font-semibold text-amber-900">Avisos d’assignació</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {draftWithMeta.attentionNotes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

      <QuadrantEditor
        key={editorKey}
        event={editorEvent}
        active
        layout="inline"
        existingDraft={creatingPhaseKey ? null : (quadrant as EditorDraftInput)}
        onSaved={async () => {
          setCreatingPhaseKey(null)
          await onSaved?.()
        }}
        onCancel={() => setCreatingPhaseKey(null)}
      />
    </div>
  )
}
