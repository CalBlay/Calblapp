import { formatDateOnly } from '@/lib/date-format'
import type { Ticket } from '../../types'

export function buildSupplierSubject(ticket: Ticket) {
  const code = ticket.ticketCode || ticket.incidentNumber || 'TIC'
  const title = String(ticket.operatorTitle || ticket.description || '').trim()
  return title
    ? `Ticket manteniment ${code} - ${title}`
    : `Ticket manteniment ${code}`
}

export function buildSupplierMessage(ticket: Ticket) {
  const taskTitle = String(ticket.operatorTitle || ticket.description || '').trim()
  const machine = String(ticket.machine || '').trim()
  const lines = [
    'Bon dia,',
    '',
    'Us preguem revisio i disponibilitat per aquesta actuacio de manteniment.',
    taskTitle ? `Descripcio de la feina: ${taskTitle}` : '',
    machine ? `Maquinaria: ${machine}` : '',
    '',
    'Gracies.',
  ]
  return lines.filter(Boolean).join('\n')
}

export function formatDateInput(value?: number | string | null) {
  if (!value && value !== 0) return ''
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getSourceText(value?: string | null) {
  if (value === 'whatsblapp') return 'WhatsBlApp'
  if (value === 'incidencia') return 'Incidencia'
  if (value === 'manual') return 'Manual'
  return value || 'Manual'
}

export function buildEventMeta(title?: string | null, date?: string | null) {
  const shortTitle = (title || '')
    .split('/')
    .map((chunk) => chunk.trim())
    .filter(Boolean)[0]
  return [shortTitle || title || '', formatDateOnly(date, '')].filter(Boolean).join(' - ')
}
