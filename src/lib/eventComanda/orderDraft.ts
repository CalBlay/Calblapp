import type { EventComandaOrderLine } from '@/lib/eventComanda/types'

const draftKey = (eventId: string) => `event-comanda-draft:${eventId}`

export function loadOrderDraft(eventId: string): EventComandaOrderLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(draftKey(eventId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as EventComandaOrderLine[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveOrderDraft(eventId: string, lines: EventComandaOrderLine[]) {
  if (typeof window === 'undefined') return
  try {
    if (lines.length === 0) {
      sessionStorage.removeItem(draftKey(eventId))
      return
    }
    sessionStorage.setItem(draftKey(eventId), JSON.stringify(lines))
  } catch {
    // ignore quota errors
  }
}

export function clearOrderDraft(eventId: string) {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(draftKey(eventId))
}
