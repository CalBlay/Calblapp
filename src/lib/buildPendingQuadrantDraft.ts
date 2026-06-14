import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import { normalizeDepartmentKey } from '@/lib/quadrantsDraftEditor'

const PENDING_PREFIX = 'pending:'

export const buildPendingExpandKey = (phase: UnifiedEvent): string => {
  const eventId = canonicalEventId(phase)
  const phaseKey = normalizePhaseKey(phase)
  const phaseDate = phaseDay(phase)
  return `${PENDING_PREFIX}${eventId}:${phaseKey}:${phaseDate}`
}

export const isPendingExpandKey = (key: string | null | undefined): boolean =>
  Boolean(key && key.startsWith(PENDING_PREFIX))

export const parsePendingExpandKey = (
  key: string
): { eventId: string; phaseKey: string; phaseDate: string } | null => {
  if (!isPendingExpandKey(key)) return null
  const parts = key.slice(PENDING_PREFIX.length).split(':')
  if (parts.length < 3) return null
  const phaseDate = parts.pop() || ''
  const phaseKey = parts.pop() || 'event'
  const eventId = parts.join(':')
  if (!eventId || !phaseDate) return null
  return { eventId, phaseKey, phaseDate }
}

export const findPhaseByPendingExpandKey = (
  key: string,
  events: UnifiedEvent[]
): UnifiedEvent | undefined => {
  const parsed = parsePendingExpandKey(key)
  if (!parsed) return undefined
  return events.find((ev) => {
    return (
      canonicalEventId(ev) === parsed.eventId &&
      normalizePhaseKey(ev) === parsed.phaseKey &&
      phaseDay(ev) === parsed.phaseDate
    )
  })
}

const canonicalEventId = (phase: UnifiedEvent): string =>
  String(phase.eventId || phase.id || '')
    .trim()
    .split('__')[0]
    .trim()

const normalizePhaseKey = (phase: UnifiedEvent): string =>
  String(phase.phaseKey || phase.phaseType || 'event')
    .toLowerCase()
    .trim() || 'event'

const phaseDay = (phase: UnifiedEvent): string =>
  String(phase.phaseDate || phase.start || '').slice(0, 10)

const phaseLabel = (phase: UnifiedEvent): string => {
  const raw = String(phase.phaseLabel || phase.phaseType || 'Event').trim()
  if (!raw) return 'Event'
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export const buildPendingQuadrantDocId = (
  phase: UnifiedEvent,
  groupKey = 'group'
): string => {
  const eventId = canonicalEventId(phase)
  const key = normalizePhaseKey(phase)
  const date = phaseDay(phase) || 'nodate'
  const sanitizedGroup = groupKey.replace(/[^a-zA-Z0-9_-]/g, '') || 'group'
  return `${eventId}__${key}__${date}__${sanitizedGroup}`
}

const cleanLocation = (phase: UnifiedEvent): string =>
  String(phase.location || '').trim()

const extractCode = (phase: UnifiedEvent): string => {
  const direct = String(phase.code || '').trim()
  if (direct) return direct
  const match = String(phase.summary || '').match(/[A-Z]\d{6,}/)
  return match?.[0]?.toUpperCase() || ''
}

export const buildPendingQuadrantDraft = (
  phase: UnifiedEvent,
  department: string
): Draft & {
  phaseType?: string
  phaseLabel?: string
  phaseDate?: string
} => {
  const dept = normalizeDepartmentKey(department)
  const startDate = phaseDay(phase)
  const endDate = String(phase.originalEnd || phase.end || startDate).slice(0, 10) || startDate
  const startTime = String(phase.displayStartTime || phase.startTime || '').trim()
  const endTime = String(phase.displayEndTime || phase.endTime || '').trim()
  const meetingPoint = cleanLocation(phase)
  const responsableName = String(phase.responsable || '').trim()
  const phaseKey = normalizePhaseKey(phase)
  const groupId = 'group-1'
  const useGroupedEditor = dept === 'serveis' && phaseKey === 'event'

  const groups = useGroupedEditor
    ? [
        {
          id: groupId,
          serviceDate: startDate,
          dateLabel: phase.eventDateLabel || null,
          meetingPoint,
          startTime,
          endTime,
          workers: responsableName ? 1 : 0,
          drivers: 0,
          needsDriver: false,
          wantsResponsible: true,
          responsibleName: responsableName || null,
        },
      ]
    : dept === 'cuina'
    ? [
        {
          id: groupId,
          serviceDate: startDate,
          meetingPoint,
          startTime,
          endTime,
          workers: responsableName ? 1 : 0,
          drivers: 0,
          wantsResponsible: true,
          responsibleName: responsableName || null,
        },
      ]
    : undefined

  return {
    id: buildPendingQuadrantDocId(phase, useGroupedEditor || dept === 'cuina' ? groupId : 'group'),
    code: extractCode(phase),
    eventName: String(phase.summary || '-').trim(),
    startDate,
    endDate,
    startTime,
    endTime,
    location: meetingPoint,
    meetingPoint,
    department: dept,
    status: 'draft',
    responsableName: responsableName || undefined,
    responsablesNeeded: 1,
    numDrivers: dept === 'logistica' ? 1 : 0,
    totalWorkers: 0,
    groups,
    phaseType: phaseKey,
    phaseLabel: phaseLabel(phase),
    phaseDate: startDate,
  }
}
