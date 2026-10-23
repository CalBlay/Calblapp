import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeAssignedIds, rangesOverlap } from '@/lib/maintenanceAssigneeConflict'

type PlannedTicketRecord = {
  ticketCode?: string
  incidentNumber?: string
  assignedToIds?: unknown
  assignedToNames?: unknown
  plannedStart?: unknown
  plannedEnd?: unknown
}

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    const parsed = (value as { toDate: () => Date }).toDate().getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

export type MaintenancePlanningConflict = {
  conflictingTicketId: string
  conflictingTicketCode: string
  conflictingPersonId: string
  conflictingPersonName: string
  conflictingStart: number | null
  conflictingEnd: number | null
}

export async function findMaintenancePlanningConflict(params: {
  ticketId?: string | null
  assignedToIds: string[]
  plannedStart: number | null
  plannedEnd: number | null
}): Promise<MaintenancePlanningConflict | null> {
  const { ticketId, assignedToIds, plannedStart, plannedEnd } = params
  if (!assignedToIds.length || plannedStart === null || plannedEnd === null) return null

  const dayStart = new Date(plannedStart)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(plannedStart)
  dayEnd.setHours(23, 59, 59, 999)

  const snap = await db
    .collection('maintenanceTickets')
    .where('plannedStart', '>=', dayStart.getTime())
    .where('plannedStart', '<=', dayEnd.getTime())
    .get()

  for (const doc of snap.docs) {
    if (ticketId && doc.id === ticketId) continue
    const data = doc.data() as PlannedTicketRecord
    const otherIds = normalizeAssignedIds(data.assignedToIds)
    if (!otherIds.some((id) => assignedToIds.includes(id))) continue

    const otherStart = toMillis(data.plannedStart)
    const otherEnd = toMillis(data.plannedEnd)
    if (!rangesOverlap(plannedStart, plannedEnd, otherStart, otherEnd)) continue

    const conflictId = otherIds.find((id) => assignedToIds.includes(id)) || ''
    const assignedNames = Array.isArray(data.assignedToNames) ? data.assignedToNames : []
    return {
      conflictingTicketId: doc.id,
      conflictingTicketCode: String(data.ticketCode || data.incidentNumber || doc.id).trim(),
      conflictingPersonId: conflictId,
      conflictingPersonName: String(assignedNames[otherIds.indexOf(conflictId)] || '').trim(),
      conflictingStart: otherStart,
      conflictingEnd: otherEnd,
    }
  }

  const plannedDate = new Date(plannedStart)
  const dateKey = `${plannedDate.getFullYear()}-${String(plannedDate.getMonth() + 1).padStart(2, '0')}-${String(plannedDate.getDate()).padStart(2, '0')}`
  const preventiusSnap = await db
    .collection('maintenancePreventiusPlanned')
    .where('date', '==', dateKey)
    .get()

  for (const doc of preventiusSnap.docs) {
    const data = doc.data() as {
      startTime?: string
      endTime?: string
      workerIds?: unknown
      workerNames?: unknown
      title?: string
    }
    const workerIds = normalizeAssignedIds(data.workerIds)
    if (!workerIds.some((id) => assignedToIds.includes(id))) continue
    const startTime = String(data.startTime || '').trim()
    const endTime = String(data.endTime || '').trim()
    if (!startTime || !endTime) continue
    const preventiveStart = new Date(`${dateKey}T${startTime}:00`).getTime()
    const preventiveEnd = new Date(`${dateKey}T${endTime}:00`).getTime()
    if (!rangesOverlap(plannedStart, plannedEnd, preventiveStart, preventiveEnd)) continue

    const conflictId = workerIds.find((id) => assignedToIds.includes(id)) || ''
    const workerNames = Array.isArray(data.workerNames) ? data.workerNames.map(String) : []
    return {
      conflictingTicketId: doc.id,
      conflictingTicketCode: String(data.title || 'Manteniment preventiu').trim(),
      conflictingPersonId: conflictId,
      conflictingPersonName: String(workerNames[workerIds.indexOf(conflictId)] || '').trim(),
      conflictingStart: preventiveStart,
      conflictingEnd: preventiveEnd,
    }
  }

  return null
}
