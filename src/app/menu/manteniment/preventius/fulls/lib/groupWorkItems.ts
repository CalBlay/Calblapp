import { parseISO } from 'date-fns'
import { normalizeMaintenanceStatus, WORKER_VISIBLE_JOURNEY_STATUSES } from './status'
import type {
  JourneyDateFilters,
  PreventiuPlannedItem,
  TicketJourneyItem,
  WorkItem,
} from './types'

type GroupParams = {
  filters: JourneyDateFilters
  plannedItems: PreventiuPlannedItem[]
  ticketItems: TicketJourneyItem[]
  kindFilter: 'all' | 'preventiu' | 'ticket'
  workerFilter: string
  statusFilter: string
  searchQuery: string
  canFilterByWorker: boolean
  role: string
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterItemsByDateRange(
  filters: JourneyDateFilters,
  plannedItems: PreventiuPlannedItem[],
  ticketItems: TicketJourneyItem[]
): WorkItem[] {
  const start = parseISO(filters.start)
  const end = parseISO(filters.end)
  return [...plannedItems, ...ticketItems].filter((item) => {
    const date = parseISO(item.date)
    return date >= start && date <= end
  })
}

export function groupWorkItems({
  filters,
  plannedItems,
  ticketItems,
  kindFilter,
  workerFilter,
  statusFilter,
  searchQuery,
  canFilterByWorker,
  role,
}: GroupParams): Array<[string, WorkItem[]]> {
  const workerNeedle = workerFilter.toLowerCase()
  const searchNeedle = normalizeText(searchQuery)
  const filteredByDate = filterItemsByDateRange(filters, plannedItems, ticketItems)

  const items = filteredByDate.filter((item) => {
    const matchesKind =
      kindFilter === 'all' ? true : kindFilter === 'ticket' ? item.kind === 'ticket' : item.kind === 'preventiu'
    const matchesWorker =
      !canFilterByWorker || workerFilter === 'all'
        ? true
        : (item.worker || '')
            .split(',')
            .map((w) => w.trim().toLowerCase())
            .filter(Boolean)
            .includes(workerNeedle)

    const itemStatus =
      item.kind === 'ticket'
        ? normalizeMaintenanceStatus((item as TicketJourneyItem).status)
        : normalizeMaintenanceStatus((item as PreventiuPlannedItem).lastStatus)
    const matchesWorkerStatus =
      role === 'treballador' ? WORKER_VISIBLE_JOURNEY_STATUSES.has(itemStatus) : true
    const matchesStatus = statusFilter === 'all' ? true : itemStatus === statusFilter
    const matchesSearch =
      !searchNeedle ||
      normalizeText(
        [
          item.title,
          item.location,
          item.machine,
          item.worker,
          item.vehiclePlate,
          item.kind === 'ticket' ? (item as TicketJourneyItem).code : '',
        ]
          .filter(Boolean)
          .join(' ')
      ).includes(searchNeedle)

    return matchesKind && matchesWorker && matchesWorkerStatus && matchesStatus && matchesSearch
  })

  const map = new Map<string, WorkItem[]>()
  items.forEach((item) => {
    const list = map.get(item.date) || []
    list.push(item)
    map.set(item.date, list)
  })

  return Array.from(map.entries())
    .map(([day, dayItems]) => [
      day,
      [...dayItems].sort((a, b) => {
        const byStart = String(a.startTime || '').localeCompare(String(b.startTime || ''))
        if (byStart !== 0) return byStart
        const byEnd = String(a.endTime || '').localeCompare(String(b.endTime || ''))
        if (byEnd !== 0) return byEnd
        return String(a.title || '').localeCompare(String(b.title || ''))
      }),
    ] as [string, WorkItem[]])
    .sort(([a], [b]) => (a > b ? 1 : -1))
}

export function collectWorkerOptions(items: WorkItem[]): string[] {
  const values = new Set<string>()
  items.forEach((item) => {
    const raw = (item.worker || '').trim()
    if (!raw) return
    raw
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean)
      .forEach((w) => values.add(w))
  })
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

export function collectStatusOptions(items: WorkItem[], role: string): string[] {
  const values = new Set<string>()
  items.forEach((item) => {
    const raw =
      item.kind === 'ticket'
        ? normalizeMaintenanceStatus((item as TicketJourneyItem).status)
        : normalizeMaintenanceStatus((item as PreventiuPlannedItem).lastStatus)
    if (role === 'treballador' && !WORKER_VISIBLE_JOURNEY_STATUSES.has(raw)) return
    if (!raw) return
    values.add(raw)
  })
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}
