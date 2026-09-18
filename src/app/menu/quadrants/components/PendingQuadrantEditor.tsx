'use client'

import React, { useMemo } from 'react'
import { QuadrantEditor } from '@/app/menu/quadrants/[id]/components/QuadrantModal'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'
import { unifiedPhaseToQuadrantEvent } from '@/lib/unifiedPhaseToQuadrantEvent'
import { isQuadrantRecordConfirmed } from '@/lib/quadrantsPermissions'

type Props = {
  phase: UnifiedEvent
  department?: string
  onSaved?: () => void | Promise<void>
  onRegisterAutoSave?: (handler: (() => Promise<boolean>) | null) => void
}

export default function PendingQuadrantEditor({
  phase,
  department,
  onSaved,
  onRegisterAutoSave,
}: Props) {
  const event = useMemo(() => {
    const base = unifiedPhaseToQuadrantEvent(phase)
    const resolvedDepartment = String(base.department || phase.department || department || '').trim()
    return resolvedDepartment ? { ...base, department: resolvedDepartment } : base
  }, [phase, department])
  const existingDraft = useMemo(() => {
    if (!phase.draft || phase.quadrantStatus === 'pending') return null
    const draft = phase.draft as EditorDraftInput
    return {
      ...draft,
      department: String(phase.department || draft.department || ''),
      phaseType: String(draft.phaseType || phase.phaseType || phase.phaseKey || 'event'),
      status:
        phase.quadrantStatus === 'confirmed' || isQuadrantRecordConfirmed(draft)
          ? 'confirmed'
          : draft.status || 'draft',
    }
  }, [phase.draft, phase.department, phase.phaseKey, phase.phaseType, phase.quadrantStatus])
  const editorKey = `${event.id}-${event.phaseKey || 'event'}-${event.start?.slice(0, 10) || 'nodate'}`

  return (
    <QuadrantEditor
      key={editorKey}
      event={event}
      active
      layout="inline"
      existingDraft={existingDraft}
      onSaved={onSaved}
      onRegisterAutoSave={onRegisterAutoSave}
    />
  )
}
