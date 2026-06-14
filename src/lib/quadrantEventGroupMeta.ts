import type { QuadrantStatus, UnifiedEvent } from '@/app/menu/quadrants/types'

export type QuadrantEventGroupMeta = {
  pendingCount: number
  draftCount: number
  confirmedCount: number
  phaseCount: number
  hasOverlapWarning: boolean
  hasSurvey: boolean
}

export type QuadrantEventBlockVisual = {
  accent: string
  shell: string
  header: string
  body: string
  statusLabel: string | null
}

export function getQuadrantEventGroupMeta(
  phases: UnifiedEvent[],
  options?: { hasSurvey?: boolean }
): QuadrantEventGroupMeta {
  let pendingCount = 0
  let draftCount = 0
  let confirmedCount = 0
  let hasOverlapWarning = false

  for (const phase of phases) {
    const status = phase.quadrantStatus as QuadrantStatus | undefined
    if (status === 'confirmed') confirmedCount += 1
    else if (status === 'draft') draftCount += 1
    else pendingCount += 1

    const draft = phase.draft as
      | { attentionNotes?: string[]; violations?: string[] }
      | null
      | undefined
    const attention = Array.isArray(draft?.attentionNotes) ? draft.attentionNotes : []
    const violations = Array.isArray(draft?.violations) ? draft.violations : []
    if (
      attention.some((n) => n.includes('ja està assignat')) ||
      violations.includes('person_double_booked')
    ) {
      hasOverlapWarning = true
    }
  }

  return {
    pendingCount,
    draftCount,
    confirmedCount,
    phaseCount: phases.length,
    hasOverlapWarning,
    hasSurvey: options?.hasSurvey ?? false,
  }
}

export function getQuadrantEventBlockVisualStyle(
  meta: QuadrantEventGroupMeta,
  expanded: boolean
): QuadrantEventBlockVisual {
  if (meta.pendingCount > 0) {
    return {
      accent: 'border-l-yellow-400',
      shell: expanded
        ? 'border-yellow-200 bg-white shadow-lg ring-2 ring-yellow-100'
        : 'border-yellow-200/90 bg-white shadow-md hover:border-yellow-300 hover:shadow-lg',
      header: expanded ? 'bg-yellow-50/70' : 'bg-white',
      body: 'border-t border-yellow-100 bg-slate-50/80',
      statusLabel:
        meta.pendingCount === 1 ? '1 fase pendent' : `${meta.pendingCount} fases pendents`,
    }
  }

  if (meta.draftCount > 0) {
    return {
      accent: 'border-l-blue-500',
      shell: expanded
        ? 'border-blue-200 bg-white shadow-lg ring-2 ring-blue-100'
        : 'border-blue-200/90 bg-white shadow-md hover:border-blue-300 hover:shadow-lg',
      header: expanded ? 'bg-blue-50/70' : 'bg-white',
      body: 'border-t border-blue-100 bg-slate-50/80',
      statusLabel:
        meta.draftCount === 1 ? '1 esborrany' : `${meta.draftCount} esborranys`,
    }
  }

  return {
    accent: 'border-l-green-500',
    shell: expanded
      ? 'border-green-200 bg-white shadow-md ring-2 ring-green-50'
      : 'border-slate-200 bg-slate-50/60 shadow-sm hover:border-green-200 hover:shadow-md',
    header: expanded ? 'bg-green-50/50' : 'bg-slate-50/60',
    body: 'border-t border-green-100 bg-white',
    statusLabel: meta.confirmedCount > 0 ? 'Tot confirmat' : null,
  }
}
