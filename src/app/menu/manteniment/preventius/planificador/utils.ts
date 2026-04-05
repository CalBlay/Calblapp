import { format, parseISO } from 'date-fns'
import { formatDayMonthValue } from '@/lib/date-format'
import type { ScheduledItem, TicketCard } from './types'

/** Preventiu ja planificat aquesta setmana (templateId o, si falta a BD, mateix nom que el títol al calendari). */
export function isPreventiuScheduledInWeek(
  templateId: string,
  templateName: string,
  scheduled: ScheduledItem[]
): boolean {
  return scheduled.some((s) => {
    if (s.kind !== 'preventiu') return false
    if (s.templateId && s.templateId === templateId) return true
    if (!s.templateId && templateName && s.title) {
      return normalizeName(s.title) === normalizeName(templateName)
    }
    return false
  })
}

export function isTicketScheduledInWeek(ticketId: string, scheduled: ScheduledItem[]): boolean {
  return scheduled.some((s) => {
    if (s.kind !== 'ticket') return false
    const sid = String(s.ticketId || s.id || '')
    return sid === String(ticketId)
  })
}

export const WORKER_BADGE_CLASSES = [
  'bg-blue-100 text-blue-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-lime-100 text-lime-800',
  'bg-fuchsia-100 text-fuchsia-800',
]

export const PRIORITY_LABEL: Record<'urgent' | 'alta' | 'normal' | 'baixa', string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

export const PRIORITY_WEIGHT: Record<'urgent' | 'alta' | 'normal' | 'baixa', number> = {
  urgent: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
}

export const normalizeName = (value: string) =>
  value
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

export const getWorkerBadgeClass = (name: string) => {
  const key = normalizeName(name)
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return WORKER_BADGE_CLASSES[hash % WORKER_BADGE_CLASSES.length]
}

export const getPriorityTone = (
  kind: 'preventiu' | 'ticket',
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
) => {
  const safe = priority || 'normal'
  const base = kind === 'preventiu' ? 'bg-emerald-50/90' : 'bg-blue-50/95'

  if (safe === 'urgent') {
    return {
      card:
        kind === 'preventiu'
          ? `${base} border-orange-300 ring-1 ring-orange-200`
          : `${base} border-red-300 ring-1 ring-red-200`,
      marker: kind === 'preventiu' ? 'bg-emerald-500' : 'bg-red-500',
      pill: 'bg-red-100 text-red-800',
    }
  }
  if (safe === 'alta') {
    return {
      card:
        kind === 'preventiu'
          ? `${base} border-emerald-300 ring-1 ring-emerald-200`
          : `${base} border-amber-300 ring-1 ring-amber-200`,
      marker: kind === 'preventiu' ? 'bg-emerald-500' : 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-800',
    }
  }
  if (safe === 'baixa') {
    return {
      card:
        kind === 'preventiu'
          ? `${base} border-emerald-200`
          : `${base} border-sky-300`,
      marker: kind === 'preventiu' ? 'bg-emerald-500' : 'bg-sky-500',
      pill:
        kind === 'preventiu'
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-sky-100 text-sky-800',
    }
  }
  return {
    card:
      kind === 'preventiu'
        ? `${base} border-emerald-200`
        : `${base} border-sky-300 ring-1 ring-sky-100`,
    marker: kind === 'preventiu' ? 'bg-emerald-500' : 'bg-sky-500',
    pill:
      kind === 'preventiu'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-sky-100 text-sky-800',
  }
}

export const parseStoredDate = (value?: string | null) => {
  const raw = (value || '').trim()
  if (!raw) return null

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    date.setHours(0, 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const date = new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]))
    date.setHours(0, 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = parseISO(raw)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

export const calculateNextDue = (
  lastDone: Date,
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
) => {
  if (!periodicity) return null
  const next = new Date(lastDone)
  if (periodicity === 'daily') next.setDate(next.getDate() + 1)
  if (periodicity === 'weekly') next.setDate(next.getDate() + 7)
  if (periodicity === 'monthly') next.setMonth(next.getMonth() + 1)
  if (periodicity === 'quarterly') next.setMonth(next.getMonth() + 3)
  if (periodicity === 'yearly') next.setFullYear(next.getFullYear() + 1)
  next.setHours(23, 59, 59, 999)
  return next
}

export const getAgeDays = (value?: string | number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor((Date.now() - value) / 86400000))
  }
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor((Date.now() - parsed) / 86400000))
    }
  }
  return 0
}

export const getAgeBucket = (ageDays: number): TicketCard['ageBucket'] => {
  if (ageDays <= 0) return 'today'
  if (ageDays <= 2) return 'days_1_2'
  if (ageDays <= 7) return 'days_3_7'
  return 'days_8_plus'
}

export const getAgeLabel = (ageDays: number) => {
  if (ageDays <= 0) return 'Avui'
  if (ageDays === 1) return '1 dia'
  return `${ageDays} dies`
}

export const getAgeBadgeClass = (ageBucket: TicketCard['ageBucket']) => {
  if (ageBucket === 'days_8_plus') return 'bg-red-100 text-red-800'
  if (ageBucket === 'days_3_7') return 'bg-amber-100 text-amber-800'
  if (ageBucket === 'days_1_2') return 'bg-sky-100 text-sky-800'
  return 'bg-emerald-100 text-emerald-800'
}

export const formatTicketCreatedAt = (value?: string | number | null) => {
  return formatDayMonthValue(value, '')
}

export const minutesFromTime = (time: string) => {
  const [hh, mm] = time.split(':').map(Number)
  return hh * 60 + mm
}

export const timeFromMinutes = (total: number) => {
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
