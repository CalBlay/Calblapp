import type { EventComandaOrderLine } from '@/lib/eventComanda/types'

export type OrderDraftSourceMode = 'template' | 'scratch'

export type OrderDraftMeta = {
  deliveryDate?: string
  deliveryTimeSlot?: string
  comments?: string
}

const draftKey = (eventId: string) => `event-comanda-draft:${eventId}`
const draftModeKey = (eventId: string) => `event-comanda-draft-mode:${eventId}`
const draftMetaKey = (eventId: string) => `event-comanda-draft-meta:${eventId}`

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

export function loadOrderDraftMode(eventId: string): OrderDraftSourceMode | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(draftModeKey(eventId))
    return raw === 'template' || raw === 'scratch' ? raw : null
  } catch {
    return null
  }
}

export function saveOrderDraftMode(eventId: string, mode: OrderDraftSourceMode) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(draftModeKey(eventId), mode)
  } catch {
    // ignore quota errors
  }
}

export function clearOrderDraftMode(eventId: string) {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(draftModeKey(eventId))
}

export function loadOrderDraftMeta(eventId: string): OrderDraftMeta {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(draftMetaKey(eventId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as OrderDraftMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveOrderDraftMeta(eventId: string, meta: OrderDraftMeta) {
  if (typeof window === 'undefined') return
  try {
    const hasContent =
      Boolean(meta.deliveryDate?.trim()) ||
      Boolean(meta.deliveryTimeSlot?.trim()) ||
      Boolean(meta.comments?.trim())
    if (!hasContent) {
      sessionStorage.removeItem(draftMetaKey(eventId))
      return
    }
    sessionStorage.setItem(draftMetaKey(eventId), JSON.stringify(meta))
  } catch {
    // ignore quota errors
  }
}

export function clearOrderDraft(eventId: string) {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(draftKey(eventId))
  sessionStorage.removeItem(draftModeKey(eventId))
  sessionStorage.removeItem(draftMetaKey(eventId))
}
