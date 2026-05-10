import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { GroupPayload, TimetableEntry } from './quadrantModalTypes'

export const extractDate = (iso = '') => iso.split('T')[0] || ''

export const parseEventCode = (title = ''): string => {
  const t = String(title || '')
  const mHash = t.match(/#\s*([A-Z]{1,2}\d{5,})\b/i)
  if (mHash) return mHash[1].toUpperCase()
  const all = [...t.matchAll(/\b([A-Z]{1,2}\d{5,})\b/gi)]
  if (all.length) return all[all.length - 1][1].toUpperCase()
  return ''
}

export const splitTitle = (title = '') => {
  const code = parseEventCode(title)
  let name = title
  if (code) {
    name = name.replace(new RegExp(`([\\-â€“â€”#]\s*)?${code}\s*$`, 'i'), '').trim()
  }
  return { name: name.trim(), code }
}

export const normalizeTime = (value?: string) => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export const collectTimetable = (entry: TimetableEntry) => {
  const start = normalizeTime(entry.startTime)
  const end = normalizeTime(entry.endTime)
  if (start && end) return { startTime: start, endTime: end }
  return null
}

export const makeGroupId = () => `group-${Date.now()}-${Math.random().toString(16).slice(2)}`

export const getDateRange = (startIso?: string, endIso?: string) => {
  const safeStart = extractDate(startIso || '')
  if (!safeStart) return []

  try {
    const start = parseISO(startIso || safeStart)
    const end = parseISO(endIso || startIso || safeStart)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return [safeStart]
    }

    const totalDays = Math.max(differenceInCalendarDays(end, start), 0)
    return Array.from({ length: totalDays + 1 }, (_, index) =>
      format(addDays(start, index), 'yyyy-MM-dd')
    )
  } catch {
    return [safeStart]
  }
}

export const clonePayloadForDate = (
  payload: Record<string, unknown>,
  department: string,
  date: string
): Record<string, unknown> => {
  const nextPayload: Record<string, unknown> = {
    ...payload,
    startDate: date,
    endDate: date,
    phaseDate: date,
    phaseType: (payload.phaseType as string) || 'event',
    phaseLabel: (payload.phaseLabel as string) || 'Event',
    generationScope: 'event',
  }

  if (Array.isArray(payload.groups)) {
    nextPayload.groups = payload.groups.map((group) => {
      const merged = {
        ...(group as GroupPayload),
        ...group,
        serviceDate:
          department === 'serveis' ? date : (group as GroupPayload)?.serviceDate ?? date,
      } as Record<string, unknown>
      if (Array.isArray(merged.manualWorkers)) {
        merged.manualWorkers = (merged.manualWorkers as Array<Record<string, unknown>>).map((mw) => ({
          ...mw,
          serviceDate: date,
        }))
      }
      return merged
    })
  }

  if (Array.isArray(payload.externalWorkers)) {
    nextPayload.externalWorkers = payload.externalWorkers.map((worker) => ({
      ...(worker as Record<string, unknown>),
      startDate: date,
      endDate: date,
    }))
  }

  if (Array.isArray(payload.logisticaPhases)) {
    nextPayload.logisticaPhases = payload.logisticaPhases.map((phase: Record<string, unknown>) => ({
      ...phase,
      date,
      endDate: date,
      manualWorkers: Array.isArray(phase.manualWorkers)
        ? phase.manualWorkers.map((mw: Record<string, unknown>) => ({ ...mw, serviceDate: date }))
        : phase.manualWorkers,
    }))
  }

  return nextPayload
}

export const buildPreferredAssignments = (proposal?: {
  responsible?: { name?: string | null } | null
  drivers?: Array<{ name?: string | null }>
  staff?: Array<{ name?: string | null }>
} | null) => {
  if (!proposal) return null

  const preferredResponsibleName = String(proposal.responsible?.name || '').trim()
  const preferredDriverNames = Array.isArray(proposal.drivers)
    ? proposal.drivers.map((driver) => String(driver?.name || '').trim()).filter(Boolean)
    : []
  const preferredStaffNames = Array.isArray(proposal.staff)
    ? proposal.staff
        .map((member) => String(member?.name || '').trim())
        .filter((name) => Boolean(name) && name !== 'Extra')
    : []

  return {
    preferredResponsibleName: preferredResponsibleName || null,
    preferredDriverNames,
    preferredStaffNames,
  }
}
