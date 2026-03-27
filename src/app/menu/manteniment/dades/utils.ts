import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import { formatDateTimeValue, parseDateValue } from '@/lib/date-format'
import type { MachineRow, MachineTimelineItem, MachineView } from './types'

export const STATUS_LABELS: Record<string, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'En espera',
  fet: 'Fet',
  no_fet: 'No fet',
  validat: 'Validat',
  resolut: 'Validat',
}

export const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export const parseDate = (value?: string | number | null): Date | null => {
  return parseDateValue(value)
}

export const formatDateTime = (value?: string | number | null) => {
  return formatDateTimeValue(value)
}

export const formatTrackedHours = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '--'
  const hours = minutes / 60
  return `${new Intl.NumberFormat('ca-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(hours)} h`
}

export const getMinutesFromRange = (start?: string | null, end?: string | null) => {
  if (!start || !end) return 0
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return 0
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute))
}

export const getTrackedMinutes = (ticket: Ticket) =>
  (ticket.statusHistory || []).reduce((total, item) => total + getMinutesFromRange(item.startTime, item.endTime), 0)

export const getPlannedMinutes = (ticket: Ticket) => {
  const plannedStart = parseDate(ticket.plannedStart)
  const plannedEnd = parseDate(ticket.plannedEnd)
  if (plannedStart && plannedEnd) {
    return Math.max(0, Math.round((plannedEnd.getTime() - plannedStart.getTime()) / 60000))
  }
  return Math.max(0, Number(ticket.estimatedMinutes || 0))
}

export const getDaysOpen = (createdAt?: string | number | null) => {
  const parsed = parseDate(createdAt)
  if (!parsed) return null
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
}

export const getLastMovementAt = (ticket: Ticket) => {
  const latestHistoryAt = (ticket.statusHistory || []).reduce(
    (latest, item) => Math.max(latest, Number(item.at || 0)),
    0
  )
  return (
    latestHistoryAt ||
    Number(ticket.assignedAt || 0) ||
    Number(parseDate(ticket.createdAt)?.getTime() || 0) ||
    0
  )
}

export const buildMachineForm = (item: MachineRow): MachineView => ({
  id: item.id,
  code: item.code || '',
  name: item.name || '',
  location: item.location || '',
  brand: item.brand || '',
  model: item.model || '',
  serialNumber: item.serialNumber || '',
  supplierId: item.supplierId || '',
  supplierName: item.supplierName || '',
  active: item.active !== false,
})

export const machineMatchesTicket = (machine: MachineRow, ticket: Ticket) => {
  const machineCode = normalizeText(machine.code)
  const machineName = normalizeText(machine.name)
  const ticketMachine = normalizeText(ticket.machine)
  if (!ticketMachine) return false
  if (machineCode && ticketMachine.includes(machineCode)) return true
  if (machineName && ticketMachine.includes(machineName)) return true
  return false
}

export const buildMachineTimeline = (tickets: Ticket[]): MachineTimelineItem[] =>
  tickets
    .flatMap((ticket) => {
      const history = ticket.statusHistory || []
      if (history.length === 0) {
        return [
          {
            id: `${ticket.id}-created`,
            ticketId: ticket.id,
            status: ticket.status,
            label: ticket.description || ticket.ticketCode || 'Ticket',
            at: Number(parseDate(ticket.createdAt)?.getTime() || 0),
            byName: ticket.createdByName,
          },
        ]
      }
      return history.map((item, index) => ({
        id: `${ticket.id}-${item.status}-${item.at}-${index}`,
        ticketId: ticket.id,
        status: item.status,
        label: ticket.description || ticket.ticketCode || 'Ticket',
        at: Number(item.at || 0),
        byName: item.byName,
        note: item.note || null,
        startTime: item.startTime || null,
        endTime: item.endTime || null,
      }))
    })
    .sort((a, b) => b.at - a.at)
