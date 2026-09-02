import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  deleteOutlookCalendarEvent,
  upsertMaintenanceTicketCalendarEvent,
} from '@/services/graph/calendar'

export type MaintenanceTicketOutlookEventRef = {
  eventId: string
  email: string
  role: 'creator' | 'assignee'
}

export type SyncMaintenanceTicketOutlookInput = {
  ticketId: string
  ticketCode?: string | null
  location?: string | null
  machine?: string | null
  description?: string | null
  createdById?: string | null
  assignedToIds?: string[]
  assignedToNames?: string[]
  plannedStart?: number | string | null
  plannedEnd?: number | string | null
  existingEvents?: Record<string, MaintenanceTicketOutlookEventRef>
  clearPlanning?: boolean
}

type UserContact = {
  email: string
  name: string
}

function toMillis(value?: number | string | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

export function toOutlookMadridDateTime(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value.padStart(2, '0') ?? '00'

  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}`
}

async function loadUserContacts(userIds: string[]): Promise<Map<string, UserContact>> {
  const uniqueIds = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)))
  const contacts = new Map<string, UserContact>()

  await Promise.all(
    uniqueIds.map(async (userId) => {
      const snap = await db.collection('users').doc(userId).get()
      if (!snap.exists) return
      const data = snap.data() || {}
      const email = String(data.email || '').trim()
      if (!email || !email.includes('@')) return
      contacts.set(userId, {
        email,
        name: String(data.name || '').trim(),
      })
    })
  )

  return contacts
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildCreatorEventHtml(params: {
  ticketCode: string
  location: string
  machine: string
  description: string
  operatorNames: string[]
  startLabel: string
  endLabel: string
}) {
  const operators = params.operatorNames.filter(Boolean).join(', ') || 'Pendent'
  return `
    <p>S'ha assignat manteniment al teu ticket <strong>${escapeHtml(params.ticketCode)}</strong>.</p>
    <p><strong>Ubicacio:</strong> ${escapeHtml(params.location || '-')}</p>
    <p><strong>Maquinaria:</strong> ${escapeHtml(params.machine || '-')}</p>
    <p><strong>Operari:</strong> ${escapeHtml(operators)}</p>
    <p><strong>Franja prevista:</strong> ${escapeHtml(params.startLabel)} - ${escapeHtml(params.endLabel)}</p>
    ${params.description ? `<p><strong>Descripcio:</strong> ${escapeHtml(params.description)}</p>` : ''}
  `
}

function buildAssigneeEventHtml(params: {
  ticketCode: string
  location: string
  machine: string
  description: string
  startLabel: string
  endLabel: string
}) {
  return `
    <p>Tens un ticket de manteniment assignat: <strong>${escapeHtml(params.ticketCode)}</strong>.</p>
    <p><strong>Ubicacio:</strong> ${escapeHtml(params.location || '-')}</p>
    <p><strong>Maquinaria:</strong> ${escapeHtml(params.machine || '-')}</p>
    <p><strong>Franja prevista:</strong> ${escapeHtml(params.startLabel)} - ${escapeHtml(params.endLabel)}</p>
    ${params.description ? `<p><strong>Descripcio:</strong> ${escapeHtml(params.description)}</p>` : ''}
  `
}

export async function syncMaintenanceTicketOutlookCalendar(
  input: SyncMaintenanceTicketOutlookInput
): Promise<Record<string, MaintenanceTicketOutlookEventRef>> {
  const existingEvents = { ...(input.existingEvents || {}) }

  if (input.clearPlanning) {
    const remainingEvents: Record<string, MaintenanceTicketOutlookEventRef> = {}
    await Promise.all(
      Object.entries(existingEvents).map(async ([userId, entry]) => {
        try {
          await deleteOutlookCalendarEvent(entry.email, entry.eventId)
        } catch (err) {
          console.error('[maintenanceTicketOutlook] delete error', err)
          remainingEvents[userId] = entry
        }
      })
    )
    return remainingEvents
  }

  const plannedStart = toMillis(input.plannedStart)
  const plannedEnd = toMillis(input.plannedEnd)
  const assignedToIds = Array.isArray(input.assignedToIds)
    ? input.assignedToIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []

  if (!plannedStart || !plannedEnd || assignedToIds.length === 0) {
    return existingEvents
  }

  const startDateTime = toOutlookMadridDateTime(plannedStart)
  const endDateTime = toOutlookMadridDateTime(plannedEnd)
  const startLabel = new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(plannedStart))
  const endLabel = new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(plannedEnd))

  const ticketCode = String(input.ticketCode || input.ticketId || 'Ticket').trim()
  const location = String(input.location || '').trim()
  const machine = String(input.machine || '').trim()
  const description = String(input.description || '').trim()
  const operatorNames = Array.isArray(input.assignedToNames)
    ? input.assignedToNames.map((name) => String(name || '').trim()).filter(Boolean)
    : []

  const targetUserIds = new Set<string>(assignedToIds)
  const creatorId = String(input.createdById || '').trim()
  if (creatorId) targetUserIds.add(creatorId)

  const contacts = await loadUserContacts([...targetUserIds])
  const nextEvents: Record<string, MaintenanceTicketOutlookEventRef> = {}

  for (const userId of targetUserIds) {
    const contact = contacts.get(userId)
    const previous = existingEvents[userId]
    if (!contact) {
      if (previous) nextEvents[userId] = previous
      continue
    }

    const isCreator = creatorId === userId
    const role: MaintenanceTicketOutlookEventRef['role'] = isCreator ? 'creator' : 'assignee'
    const subject = isCreator
      ? `Manteniment assignat · ${ticketCode}${location ? ` · ${location}` : ''}`
      : `Ticket manteniment · ${ticketCode}${location ? ` · ${location}` : ''}`
    const bodyHtml = isCreator
      ? buildCreatorEventHtml({
          ticketCode,
          location,
          machine,
          description,
          operatorNames,
          startLabel,
          endLabel,
        })
      : buildAssigneeEventHtml({
          ticketCode,
          location,
          machine,
          description,
          startLabel,
          endLabel,
        })

    try {
      const event = await upsertMaintenanceTicketCalendarEvent({
        assigneeEmail: contact.email,
        eventId: previous?.email === contact.email ? previous.eventId : undefined,
        subject,
        bodyHtml,
        startDateTime,
        endDateTime,
      })
      if (!event.id) {
        if (previous) nextEvents[userId] = previous
        continue
      }
      nextEvents[userId] = {
        eventId: event.id,
        email: contact.email,
        role,
      }
    } catch (err) {
      console.error('[maintenanceTicketOutlook] upsert error', { userId, err })
      if (previous) nextEvents[userId] = previous
    }
  }

  await Promise.all(
    Object.entries(existingEvents).map(async ([userId, entry]) => {
      if (nextEvents[userId]) return
      try {
        await deleteOutlookCalendarEvent(entry.email, entry.eventId)
      } catch (err) {
        console.error('[maintenanceTicketOutlook] cleanup delete error', { userId, err })
        nextEvents[userId] = entry
      }
    })
  )

  return nextEvents
}
