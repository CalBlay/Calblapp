import { formatDateOnly, parseDateValue } from '@/lib/date-format'

export function robaRequestCalendarDay(createdAt?: string | null): string | null {
  const d = parseDateValue(createdAt)
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Mes natural actual (1 → últim dia), per al filtre per defecte de «Moviments recents». */
export function robaMovimentsDefaultMonthRange(): { start: string; end: string } {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const iso = (dt: Date) => {
    const y = dt.getFullYear()
    const mo = String(dt.getMonth() + 1).padStart(2, '0')
    const da = String(dt.getDate()).padStart(2, '0')
    return `${y}-${mo}-${da}`
  }
  return { start: iso(start), end: iso(end) }
}

export function robaSollicitudsWeekRange(): { start: string; end: string } {
  const today = new Date()
  const monday = new Date(today)
  const dow = monday.getDay() || 7
  if (dow !== 1) monday.setDate(monday.getDate() - (dow - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const iso = (dt: Date) => {
    const y = dt.getFullYear()
    const mo = String(dt.getMonth() + 1).padStart(2, '0')
    const da = String(dt.getDate()).padStart(2, '0')
    return `${y}-${mo}-${da}`
  }
  return { start: iso(monday), end: iso(sunday) }
}

export function formatRobaDayGroupLabel(dayKey: string) {
  if (dayKey === 'sense-data') return 'Sense data'
  return formatDateOnly(dayKey)
}
