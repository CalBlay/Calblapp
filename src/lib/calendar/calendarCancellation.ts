import type { Deal } from '@/hooks/useCalendarData'

export function isCalendarDealCancelled(deal: Pick<Deal, 'cancelled'>): boolean {
  return deal.cancelled === true
}

/** Cancel is the default; only an explicit boolean false reactivates. */
export function calendarCancelledFromRequest(cancelled: unknown): boolean {
  return cancelled !== false
}

export const CALENDAR_CANCELLED_CARD_CLASS =
  'border-red-500 bg-red-100 text-red-950 ring-1 ring-inset ring-red-500'

export const CALENDAR_CANCELLED_ROW_CLASS =
  'bg-red-100 text-red-950 hover:bg-red-100'
