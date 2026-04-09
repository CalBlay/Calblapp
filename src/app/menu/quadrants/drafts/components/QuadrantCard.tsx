'use client'

import React from 'react'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import DraftsTable from './DraftsTable'

interface Props {
  quadrant: Draft
  autoExpand?: boolean
  pendingPhases?: Array<{ key: string; label: string }>
  onCreatePhase?: (phaseKey: string) => void
}

export default function QuadrantCard({
  quadrant,
  autoExpand = false,
  pendingPhases = [],
  onCreatePhase,
}: Props) {
  // Mantingut per compatibilitat amb props existents.
  void autoExpand
  const draftRenderKey = `${quadrant.id}-${quadrant.updatedAt || 'nou'}-${quadrant.status || 'draft'}`

  return (
    <div className="space-y-3">
      {((quadrant as any).phaseType || (quadrant as any).phaseLabel || '')
        .toString()
        .toLowerCase()
        .trim() === 'event' &&
        pendingPhases.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Fases pendents:</span>
              {pendingPhases.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreatePhase?.(p.key)
                  }}
                >
                  {p.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

      {Array.isArray((quadrant as any).attentionNotes) &&
        (quadrant as any).attentionNotes.length > 0 && (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            role="alert"
          >
            <div className="font-semibold text-amber-900">Avisos d’assignació</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {(quadrant as any).attentionNotes.map((line: string, i: number) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

      <DraftsTable key={draftRenderKey} draft={quadrant} />
    </div>
  )
}
