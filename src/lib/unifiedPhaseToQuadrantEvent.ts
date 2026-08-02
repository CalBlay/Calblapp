import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import type { QuadrantEvent } from '@/types/QuadrantEvent'

const normalizeLocation = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const candidate =
      (value as Record<string, unknown>).address ??
      (value as Record<string, unknown>).location ??
      (value as Record<string, unknown>).text ??
      (value as Record<string, unknown>).label ??
      (value as Record<string, unknown>).name
    if (typeof candidate === 'string') return candidate.trim()
  }
  return ''
}

export function draftToQuadrantEvent(draft: Draft): QuadrantEvent {
  const startDate = String(draft.startDate || '').slice(0, 10)
  const endDate = String(draft.endDate || startDate).slice(0, 10)
  const fallbackIso = startDate ? `${startDate}T00:00:00.000Z` : ''
  const eventId = String(draft.id || '').trim().split('__')[0]
  const phaseType = String(draft.phaseType || 'event').trim() || 'event'

  return {
    id: eventId,
    summary: String(draft.eventName || '-').trim(),
    start: fallbackIso,
    end: endDate ? `${endDate}T00:00:00.000Z` : fallbackIso,
    originalStart: fallbackIso || undefined,
    originalEnd: endDate ? `${endDate}T00:00:00.000Z` : undefined,
    startTime: String(draft.startTime || '').trim(),
    endTime: String(draft.endTime || '').trim(),
    location: normalizeLocation(draft.location) || null,
    eventLocation: normalizeLocation(draft.location) || null,
    meetingPoint: String(draft.meetingPoint || normalizeLocation(draft.location) || '').trim(),
    phaseKey: phaseType,
    phaseType,
    phaseLabel: draft.phaseLabel || undefined,
    service: draft.service ?? null,
    numPax: draft.numPax ?? null,
    code: draft.code,
    department: draft.department,
    responsable:
      typeof draft.responsableName === 'string'
        ? draft.responsableName
        : typeof draft.responsable?.name === 'string'
        ? draft.responsable.name
        : null,
  }
}

export function unifiedPhaseToQuadrantEvent(phase: UnifiedEvent): QuadrantEvent {
  const startDate = String(phase.phaseDate || phase.start || '').slice(0, 10)
  const fallbackIso = startDate ? `${startDate}T00:00:00.000Z` : ''

  return {
    ...phase,
    id: String(phase.eventId || phase.id || '')
      .trim()
      .split('__')[0],
    summary: String(phase.summary || phase.title || '-').trim(),
    start: phase.start || fallbackIso,
    end: phase.end || phase.start || fallbackIso,
    originalStart: phase.originalStart,
    originalEnd: phase.originalEnd,
    startTime: String(phase.displayStartTime || phase.startTime || '').trim(),
    endTime: String(phase.displayEndTime || phase.endTime || '').trim(),
    location: phase.location ?? null,
    eventLocation: phase.eventLocation ?? phase.location ?? null,
    meetingPoint: String(phase.meetingPoint || phase.location || '').trim(),
    phaseKey: phase.phaseKey || phase.phaseType || 'event',
    phaseType: phase.phaseType || phase.phaseKey || 'event',
    phaseLabel: phase.phaseLabel,
    service: phase.service ?? null,
    numPax: phase.numPax ?? null,
    code: phase.code,
    responsable: phase.responsable ?? null,
    department: phase.department,
  }
}
