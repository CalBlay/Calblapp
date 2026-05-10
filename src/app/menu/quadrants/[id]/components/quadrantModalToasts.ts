import { toast } from 'sonner'
import type { LearningStatus, QuadrantMode } from './quadrantModalTypes'

export const toastLearningStatus = (
  status: LearningStatus | null | undefined,
  mode: QuadrantMode
) => {
  if (mode !== 'auto' || !status) return
  if (status.hasEnoughData) {
    if (status.hasNameSuggestions) {
      toast.success(
        `Auto basat en ${status.similarSampleCount ?? status.sampleCount ?? 0} quadrants similars`,
        {
          description:
            'Suggeriment de noms aplicat a partir de l’historic. Revisa el quadrant abans de confirmar.',
          duration: 8_000,
        }
      )
    } else {
      toast.info('Auto amb estructura suggerida', {
        description: `Encara hi ha poques mostres similars (${status.similarSampleCount ?? 0}). Recomanat: revisar amb semi-auto.`,
        duration: 8_000,
      })
    }
    return
  }
  toast.warning('Encara no hi ha prou dades per Auto', {
    description:
      status.reason ||
      'No hi ha quadrants confirmats prou semblants. Et recomanem fer servir semi-auto o manual.',
    duration: 10_000,
  })
}

export const toastAutoAssignDoubleBookingWarnings = (data: {
  meta?: {
    needsReview?: boolean
    violations?: string[]
    notes?: string[]
  }
}) => {
  const meta = data?.meta
  const notes = Array.isArray(meta?.notes) ? meta!.notes!.filter(Boolean) : []
  if (notes.length === 0) return
  const hasDouble =
    Array.isArray(meta?.violations) && meta!.violations!.includes('person_double_booked')
  const hasOverlapNote = notes.some((n) => String(n).includes('ja està assignat'))
  if (!hasDouble && !hasOverlapNote) return
  const preview = notes.slice(0, 5).join('\n')
  toast.warning('Atenció: possible solapament de personal', {
    description: preview,
    duration: 16_000,
  })
}
