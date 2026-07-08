import { format, parseISO } from 'date-fns'
import type { QuadrantStatus, UnifiedEvent } from '@/app/menu/quadrants/types'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function normPhaseKey(value: unknown) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function normalizeNameKey(value?: string | null) {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function cleanName(value?: unknown): string | null {
  const s = String(value ?? '').trim()
  return s || null
}

function parseCsvNames(value?: string | null): string[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

type DraftPersonnelSource = {
  responsableName?: string | { name?: string } | null
  conductors?: Array<{ name?: string | null }> | null
  treballadors?: Array<{ name?: string | null }> | null
  groups?: Array<{
    wantsResponsible?: boolean
    responsibleId?: string | null
    responsibleName?: string | null
  }> | null
}

export type QuadrantPersonRole = 'responsable' | 'conductor' | 'treballador'

export type QuadrantPersonEntry = {
  name: string
  role: QuadrantPersonRole
}

const ROLE_RANK: Record<QuadrantPersonRole, number> = {
  responsable: 3,
  conductor: 2,
  treballador: 1,
}

export function peopleFromPhase(phase: UnifiedEvent): QuadrantPersonEntry[] {
  const draft = phase.draft as DraftPersonnelSource | null | undefined
  const byKey = new Map<string, QuadrantPersonEntry>()

  const upsert = (raw: unknown, role: QuadrantPersonRole) => {
    const name = cleanName(raw)
    if (!name || name === 'Extra') return
    const key = normalizeNameKey(name)
    if (!key) return
    const existing = byKey.get(key)
    if (!existing || ROLE_RANK[role] > ROLE_RANK[existing.role]) {
      byKey.set(key, { name, role })
    }
  }

  upsert(phase.responsable, 'responsable')

  const draftRespRaw =
    typeof draft?.responsableName === 'string'
      ? draft.responsableName
      : draft?.responsableName?.name
  const draftRespKey = normalizeNameKey(draftRespRaw)
  const conductorNameKeys = new Set(
    (draft?.conductors || [])
      .map((person) => normalizeNameKey(person?.name))
      .filter(Boolean)
  )
  const explicitResponsibleId = String(
    (draft as { responsableId?: string } | null | undefined)?.responsableId || ''
  ).trim()
  const groupWantsResponsible = (draft?.groups || []).some(
    (group) =>
      group?.wantsResponsible === true &&
      Boolean(String(group?.responsibleId || group?.responsibleName || '').trim())
  )

  if (draftRespRaw) {
    const duplicateOfConductorOnly =
      !explicitResponsibleId &&
      !groupWantsResponsible &&
      draftRespKey &&
      conductorNameKeys.has(draftRespKey)
    if (!duplicateOfConductorOnly) {
      upsert(draftRespRaw, 'responsable')
    }
  }

  draft?.conductors?.forEach((person) => upsert(person?.name, 'conductor'))
  draft?.treballadors?.forEach((person) => upsert(person?.name, 'treballador'))

  const hasDraftPeople =
    Boolean(draft?.conductors?.length) || Boolean(draft?.treballadors?.length)

  if (!hasDraftPeople) {
    parseCsvNames(phase.workersSummary).forEach((name) => upsert(name, 'treballador'))
  }

  const roleOrder: QuadrantPersonRole[] = ['responsable', 'conductor', 'treballador']
  return Array.from(byKey.values()).sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  )
}

export type QuadrantPhaseStaffLine = {
  phaseLabel: string
  status: QuadrantStatus
  people: QuadrantPersonEntry[]
  schedule: string | null
}

export type QuadrantPersonnelSummary = {
  people: QuadrantPersonEntry[]
  primarySchedule: string | null
  primaryStartTime: string | null
  primaryEndTime: string | null
  phaseLines: QuadrantPhaseStaffLine[]
  hasAnyAssignment: boolean
}

export function getQuadrantPersonnelSummary(
  phases: UnifiedEvent[],
  rowDate?: string
): QuadrantPersonnelSummary {
  const phaseLines: QuadrantPhaseStaffLine[] = phases.map((phase) => {
    const day = rowDate || (phase.start ? phase.start.slice(0, 10) : '')
    const phaseLabel = buildQuadrantPhaseBadge(phase, day) || 'EVENT'
    const people = peopleFromPhase(phase)
    const startTime = phase.displayStartTime || ''
    const endTime = phase.displayEndTime || ''
    const schedule =
      startTime || endTime
        ? phase.horariLabel || `${startTime || '--:--'} – ${endTime || '--:--'}`
        : null

    return {
      phaseLabel,
      status: (phase.quadrantStatus || 'pending') as QuadrantStatus,
      people,
      schedule,
    }
  })

  const primarySchedule =
    phaseLines.find((line) => line.schedule && line.status !== 'pending')?.schedule ||
    phaseLines.find((line) => line.schedule)?.schedule ||
    null

  const primaryPhase =
    phases.find((p) => p.quadrantStatus !== 'pending' && (p.displayStartTime || p.displayEndTime)) ||
    phases.find((p) => p.displayStartTime || p.displayEndTime) ||
    phases[0]

  const primaryStartTime = primaryPhase?.displayStartTime?.slice(0, 5) || null
  const primaryEndTime = primaryPhase?.displayEndTime?.slice(0, 5) || null

  const people =
    phaseLines.length === 1
      ? phaseLines[0].people
      : mergePeopleAcrossPhases(phaseLines.flatMap((line) => line.people))

  return {
    people,
    primarySchedule,
    primaryStartTime,
    primaryEndTime,
    phaseLines,
    hasAnyAssignment: people.length > 0 || phaseLines.some((line) => line.people.length > 0),
  }
}

/** Personal assignat als borradors/confirmats del grup (exclou pendents sense draft). */
export function countAssignedStaffFromPhases(phases: UnifiedEvent[]): number {
  return phases.reduce((sum, phase) => {
    if (phase.quadrantStatus === 'pending') return sum

    const draft = phase.draft as
      | {
          totalWorkers?: number | null
          treballadors?: unknown[] | null
          conductors?: unknown[] | null
          responsableId?: string | null
          responsableName?: string | null
        }
      | null
      | undefined

    if (draft) {
      const fromRoster = peopleFromPhase(phase).length
      if (fromRoster > 0) return sum + fromRoster

      const explicit = Number(draft.totalWorkers)
      if (Number.isFinite(explicit) && explicit > 0) return sum + explicit
    }

    return sum + peopleFromPhase(phase).length
  }, 0)
}

function mergePeopleAcrossPhases(entries: QuadrantPersonEntry[]): QuadrantPersonEntry[] {
  const byKey = new Map<string, QuadrantPersonEntry>()
  entries.forEach((entry) => {
    const key = normalizeNameKey(entry.name)
    const existing = byKey.get(key)
    if (!existing || ROLE_RANK[entry.role] > ROLE_RANK[existing.role]) {
      byKey.set(key, entry)
    }
  })
  const roleOrder: QuadrantPersonRole[] = ['responsable', 'conductor', 'treballador']
  return Array.from(byKey.values()).sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  )
}

export function eventStartDisplayLabel(ev: UnifiedEvent): string {
  if (ev.eventDateLabel && String(ev.eventDateLabel).trim()) return String(ev.eventDateLabel).trim()
  const ymd = String(ev.eventDateRaw || ev.originalStart || '').slice(0, 10)
  if (!ISO_DAY.test(ymd)) return ''
  try {
    return format(parseISO(ymd), 'dd/MM')
  } catch {
    return ''
  }
}

export function isEventPhaseRow(ev: UnifiedEvent) {
  const k = normPhaseKey(ev.phaseKey)
  const t = normPhaseKey(ev.phaseType)
  const lbl = normPhaseKey(ev.phaseLabel)
  return k === 'event' || t === 'event' || lbl === 'event'
}

export function buildQuadrantPhaseBadge(ev: UnifiedEvent, rowDate: string): string {
  const row = rowDate.slice(0, 10)
  const eventDateRaw = String(ev.eventDateRaw || '').slice(0, 10)
  const phaseUpper = ev.phaseLabel ? ev.phaseLabel.toUpperCase() : ''

  if (!isEventPhaseRow(ev) && phaseUpper) {
    const startLbl = eventStartDisplayLabel(ev)
    return startLbl ? `${phaseUpper} (${startLbl})` : phaseUpper
  }

  const hasPhaseLabel = Boolean(ev.phaseLabel)
  if (!hasPhaseLabel) return ''

  const origStart = String(ev.originalStart || ev.eventDateRaw || '').slice(0, 10)
  const origEnd = String(ev.originalEnd || '').slice(0, 10)
  const isMultiDay =
    ISO_DAY.test(origStart) && ISO_DAY.test(origEnd) && origStart !== origEnd

  if (isMultiDay) {
    try {
      const span = `${format(parseISO(origStart), 'dd/MM')} - ${format(parseISO(origEnd), 'dd/MM')}`
      return `${phaseUpper} (${span})`
    } catch {
      /* continua */
    }
  }

  const showEventDate = hasPhaseLabel && eventDateRaw && row && eventDateRaw !== row
  if (showEventDate && ev.eventDateLabel) {
    return `${phaseUpper} (${ev.eventDateLabel})`
  }
  return phaseUpper
}

export function formatEventTitle(title?: string) {
  if (!title) return '(Sense títol)'
  let t = title.split('/')[0].trim()
  t = t.replace(/^\s*[A-Z]\s*-\s*/i, '').trim()
  const stopIndex = t.search(/#|code/i)
  if (stopIndex > -1) t = t.substring(0, stopIndex).trim()
  return t || '(Sense títol)'
}

export function quadrantStatusLabel(status?: string) {
  if (status === 'confirmed') return 'Confirmat'
  if (status === 'draft') return 'Esborrany'
  if (status === 'pending') return 'Pendent'
  return ''
}
