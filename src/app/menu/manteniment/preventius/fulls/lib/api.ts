import { format } from 'date-fns'
import { normalizeMaintenanceStatus, WORKER_VISIBLE_JOURNEY_STATUSES } from './status'
import type { JourneyTicket, PreventiuPlannedItem, TicketJourneyItem } from './types'

export async function fetchPlannedItems(start: string, end: string): Promise<PreventiuPlannedItem[]> {
  try {
    const res = await fetch(
      `/api/maintenance/preventius/planned?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const list = Array.isArray(json?.items) ? json.items : []
    return list
      .map((item: Record<string, unknown>) => {
        if (!item?.date || !item?.startTime || !item?.endTime) return null
        return {
          id: String(item.id || ''),
          kind: 'preventiu' as const,
          title: String(item.title || ''),
          date: String(item.date || ''),
          startTime: String(item.startTime || ''),
          endTime: String(item.endTime || ''),
          location: String(item.location || ''),
          worker: Array.isArray(item.workerNames) ? item.workerNames.join(', ') : '',
          machine: String(item.machine || ''),
          vehicleId: item.vehicleId || null,
          vehiclePlate: item.vehiclePlate || null,
          hasMedia: Boolean(item.imageUrl || (Array.isArray(item.imageUrls) && item.imageUrls.length > 0)),
          templateId: item.templateId || null,
          lastRecordId: item.lastRecordId || null,
          lastStatus: item.lastStatus || null,
          lastProgress: typeof item.lastProgress === 'number' ? item.lastProgress : null,
        }
      })
      .filter(Boolean) as PreventiuPlannedItem[]
  } catch {
    return []
  }
}

export async function fetchJourneyTickets(
  start: string,
  end: string,
  role: string,
  userId: string
): Promise<TicketJourneyItem[]> {
  try {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    params.set('dateMode', 'planned')
    params.set('limit', '500')
    if (role === 'treballador' && userId) params.set('assignedToId', userId)

    const res = await fetch(`/api/maintenance/tickets?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) return []

    const json = await res.json()
    const list = Array.isArray(json?.tickets) ? json.tickets : []

    return list
      .filter((t: Record<string, unknown>) => t.plannedStart && t.plannedEnd)
      .filter((t: Record<string, unknown>) =>
        role === 'treballador'
          ? WORKER_VISIBLE_JOURNEY_STATUSES.has(
              normalizeMaintenanceStatus(typeof t.status === 'string' ? t.status : null)
            )
          : true
      )
      .map((t: Record<string, unknown>) => {
        const plannedStart = new Date(Number(t.plannedStart))
        const plannedEnd = new Date(Number(t.plannedEnd))
        const code = String(t.ticketCode || t.incidentNumber || 'TIC')
        const title = String(t.description || t.machine || t.location || '')
        return {
          id: String(t.id || code),
          kind: 'ticket' as const,
          title,
          code,
          status: normalizeMaintenanceStatus(typeof t.status === 'string' ? t.status : null),
          ticketType: t.ticketType === 'deco' ? 'deco' : 'maquinaria',
          date: format(plannedStart, 'yyyy-MM-dd'),
          startTime: format(plannedStart, 'HH:mm'),
          endTime: format(plannedEnd, 'HH:mm'),
          location: String(t.location || ''),
          worker: Array.isArray(t.assignedToNames) ? t.assignedToNames.join(', ') : '',
          machine: String(t.machine || ''),
          vehicleId: t.vehicleId || null,
          vehiclePlate: t.vehiclePlate || null,
          hasMedia: Boolean(t.imageUrl || (Array.isArray(t.imageUrls) && t.imageUrls.length > 0)),
        }
      })
  } catch {
    return []
  }
}

export async function fetchWaitingJourneyTickets(
  role: string,
  userId: string
): Promise<TicketJourneyItem[]> {
  try {
    const params = new URLSearchParams()
    params.set('status', 'espera')
    params.set('limit', '200')
    if (role === 'treballador' && userId) params.set('assignedToId', userId)

    const res = await fetch(`/api/maintenance/tickets?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) return []

    const json = await res.json()
    const list = Array.isArray(json?.tickets) ? json.tickets : []

    return list
      .filter((t: Record<string, unknown>) => t.plannedStart && t.plannedEnd)
      .filter((t: Record<string, unknown>) =>
        role === 'treballador'
          ? normalizeMaintenanceStatus(typeof t.status === 'string' ? t.status : null) === 'espera'
          : true
      )
      .map((t: Record<string, unknown>) => {
        const plannedStart = new Date(Number(t.plannedStart))
        const plannedEnd = new Date(Number(t.plannedEnd))
        const code = String(t.ticketCode || t.incidentNumber || 'TIC')
        const title = String(t.description || t.machine || t.location || '')
        return {
          id: String(t.id || code),
          kind: 'ticket' as const,
          title,
          code,
          status: normalizeMaintenanceStatus(typeof t.status === 'string' ? t.status : null),
          ticketType: t.ticketType === 'deco' ? 'deco' : 'maquinaria',
          date: format(plannedStart, 'yyyy-MM-dd'),
          startTime: format(plannedStart, 'HH:mm'),
          endTime: format(plannedEnd, 'HH:mm'),
          location: String(t.location || ''),
          worker: Array.isArray(t.assignedToNames) ? t.assignedToNames.join(', ') : '',
          machine: String(t.machine || ''),
          vehicleId: t.vehicleId || null,
          vehiclePlate: t.vehiclePlate || null,
          hasMedia: Boolean(t.imageUrl || (Array.isArray(t.imageUrls) && t.imageUrls.length > 0)),
        }
      })
  } catch {
    return []
  }
}

export async function fetchTicketById(id: string): Promise<JourneyTicket | null> {
  try {
    const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    return json?.ticket ? (json.ticket as JourneyTicket) : null
  } catch {
    return null
  }
}

export async function resolveJourneyTicket(
  id: string,
  code?: string,
  ticketType: 'maquinaria' | 'deco' = 'maquinaria'
): Promise<JourneyTicket | null> {
  const direct = await fetchTicketById(id)
  if (direct) return direct

  if (code) {
    try {
      const res = await fetch(
        `/api/maintenance/tickets?ticketType=${ticketType}&code=${encodeURIComponent(code)}`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const json = await res.json()
        const list = Array.isArray(json?.tickets) ? json.tickets : []
        if (list[0]) return list[0] as JourneyTicket
      }
    } catch {
      return null
    }
  }

  try {
    const res = await fetch(`/api/maintenance/tickets?ticketType=${ticketType}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    const list = Array.isArray(json?.tickets) ? json.tickets : []
    return (list.find((t: JourneyTicket) => String(t.id) === String(id)) as JourneyTicket) || null
  } catch {
    return null
  }
}
