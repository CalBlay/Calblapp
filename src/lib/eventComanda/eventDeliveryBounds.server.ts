import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  parseIsoDateKey,
  resolveDeliveryDateBounds,
  validateDeliveryDateAndSlot,
  type EventComandaDeliveryDateBounds,
} from '@/lib/eventComanda/deliverySlots'

export async function getEventComandaDeliveryDateBounds(
  eventId: string,
  now = new Date()
): Promise<EventComandaDeliveryDateBounds> {
  const id = String(eventId || '').trim()
  if (!id) return resolveDeliveryDateBounds(null, now)

  const snap = await db.collection('stage_verd').doc(id).get()
  if (!snap.exists) return resolveDeliveryDateBounds(null, now)

  const data = snap.data() as Record<string, unknown>
  const eventEnd = parseIsoDateKey(
    String(data?.DataFi || data?.endDate || data?.end || data?.DataInici || data?.startDate || '')
  )

  return resolveDeliveryDateBounds(eventEnd, now)
}

function formatEventMetaDate(iso?: string | null) {
  const key = parseIsoDateKey(iso)
  if (!key) return ''
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return key
  return date.toLocaleDateString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function readEventLocation(data: Record<string, unknown>) {
  const rawLocation = typeof data.Ubicacio === 'string' ? data.Ubicacio : String(data.Ubicacio ?? '')
  return rawLocation
    .split('(')[0]
    .split('/')[0]
    .replace(/^ZZRestaurant\s*/i, '')
    .replace(/^ZZ\s*/i, '')
    .trim()
}

function readEventHoraInici(data: Record<string, unknown>) {
  const rawHora =
    typeof data.HoraInici === 'string'
      ? data.HoraInici
      : typeof data.horaInici === 'string'
        ? data.horaInici
        : typeof data.Hora === 'string'
          ? data.Hora
          : typeof data.hora === 'string'
            ? data.hora
            : ''
  return typeof rawHora === 'string' ? rawHora.trim().slice(0, 5) : ''
}

export async function getEventComandaEventDates(eventId: string) {
  const info = await getEventComandaEventInfo(eventId)
  return {
    eventStartDate: info.eventStartDate,
    eventEndDate: info.eventEndDate,
  }
}

export async function getEventComandaEventInfo(eventId: string) {
  const id = String(eventId || '').trim()
  const empty = {
    eventStartDate: null as string | null,
    eventEndDate: null as string | null,
    eventTitle: null as string | null,
    eventMeta: null as string | null,
  }
  if (!id) return empty

  const snap = await db.collection('stage_verd').doc(id).get()
  if (!snap.exists) return empty

  const data = snap.data() as Record<string, unknown>
  const eventStartDate = parseIsoDateKey(
    String(data?.DataInici || data?.startDate || data?.start || '')
  )
  const eventEndDate = parseIsoDateKey(
    String(
      data?.DataFi || data?.endDate || data?.end || data?.DataInici || data?.startDate || ''
    )
  )

  const rawSummary = String(data.NomEvent ?? data.summary ?? '').trim()
  const eventTitle = rawSummary.split('/')[0].trim() || null
  const eventMeta = [
    formatEventMetaDate(eventStartDate),
    readEventHoraInici(data),
    readEventLocation(data),
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    eventStartDate,
    eventEndDate,
    eventTitle,
    eventMeta: eventMeta || null,
  }
}

export async function assertEventComandaDeliveryDateAndSlot(params: {
  eventId: string
  deliveryDate: string
  deliveryTimeSlot: string
  now?: Date
}) {
  const bounds = await getEventComandaDeliveryDateBounds(params.eventId, params.now)
  const message = validateDeliveryDateAndSlot({
    deliveryDate: params.deliveryDate,
    deliveryTimeSlot: params.deliveryTimeSlot,
    bounds,
    now: params.now,
  })
  if (message) throw new Error(message)
}
