import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  computeHistoryWorkMinutes,
  getPlannedSlotMinutes,
  type StatusHistoryEntry,
} from '@/lib/informes/maintenanceTicketMetrics'

export type PreventiuInformeItem = {
  id: string
  plannedId: string
  title: string
  eventAtMs: number
  createdAt: string
  location: string
  status: string
  priority: string
  workerIds: string[]
  workerNames: string[]
  statusHistory: StatusHistoryEntry[]
  rawWorkMinutes: number
}

type PlannedDoc = Record<string, unknown> & {
  title?: string
  date?: string
  startTime?: string
  endTime?: string
  location?: string
  priority?: string
  workerIds?: string[]
  workerNames?: string[]
  createdAt?: number | string
  lastStatus?: string
  lastUpdatedAt?: number | string
}

type CompletedDoc = Record<string, unknown> & {
  plannedId?: string
  status?: string
  completedAt?: string | number
  updatedAt?: string | number
  statusHistory?: StatusHistoryEntry[]
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function parseTimestampMs(value?: string | number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return new Date(`${value.trim()}T12:00:00`).getTime()
    }
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizePreventiuStatus(value?: string | null) {
  const raw = normalizeText(value) || 'assignat'
  if (raw === 'nou') return 'nou'
  if (raw === 'assignat' || raw === 'pendent') return 'assignat'
  if (raw === 'en_curs' || raw === 'en curs') return 'en_curs'
  if (raw === 'espera') return 'espera'
  if (raw === 'fet') return 'fet'
  if (raw === 'no_fet' || raw === 'no fet') return 'no_fet'
  if (raw === 'resolut' || raw === 'validat') return 'validat'
  return 'assignat'
}

function normalizePriority(value?: string | null) {
  const raw = normalizeText(value) || 'normal'
  if (raw === 'urgent') return 'urgent'
  if (raw === 'alta') return 'alta'
  if (raw === 'baixa') return 'baixa'
  return 'normal'
}

export async function loadMaintenancePreventiusForInformes(): Promise<PreventiuInformeItem[]> {
  const [plannedSnap, completedSnap] = await Promise.all([
    db.collection('maintenancePreventiusPlanned').get(),
    db.collection('maintenancePreventiusCompleted').get(),
  ])

  const latestByPlannedId = new Map<string, CompletedDoc>()
  completedSnap.docs.forEach((doc) => {
    const data = doc.data() as CompletedDoc
    const plannedId = String(data.plannedId || '').trim()
    if (!plannedId) return
    const record: CompletedDoc = { id: doc.id, ...data }
    const current = latestByPlannedId.get(plannedId)
    const currentTime =
      parseTimestampMs(current?.completedAt) || parseTimestampMs(current?.updatedAt)
    const nextTime = parseTimestampMs(record.completedAt) || parseTimestampMs(record.updatedAt)
    if (!current || nextTime >= currentTime) latestByPlannedId.set(plannedId, record)
  })

  return plannedSnap.docs.map((doc) => {
    const item = doc.data() as PlannedDoc
    const plannedId = doc.id
    const record = latestByPlannedId.get(plannedId) || null
    const statusHistory = Array.isArray(record?.statusHistory)
      ? (record.statusHistory as StatusHistoryEntry[])
      : []
    const plannedMinutes = getPlannedSlotMinutes(
      String(item.startTime || ''),
      String(item.endTime || '')
    )
    const trackedMinutes = computeHistoryWorkMinutes(statusHistory)
    const rawWorkMinutes = trackedMinutes > 0 ? trackedMinutes : plannedMinutes

    const completedMs = parseTimestampMs(record?.completedAt)
    const plannedMs = parseTimestampMs(item.date)
    const createdMs = parseTimestampMs(item.createdAt)
    const eventAtMs = completedMs || plannedMs || createdMs

    return {
      id: plannedId,
      plannedId,
      title: String(item.title || 'Preventiu').trim(),
      eventAtMs,
      createdAt: eventAtMs ? new Date(eventAtMs).toISOString() : '',
      location: String(item.location || '').trim(),
      status: normalizePreventiuStatus(record?.status || item.lastStatus),
      priority: normalizePriority(item.priority),
      workerIds: Array.isArray(item.workerIds)
        ? item.workerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      workerNames: Array.isArray(item.workerNames)
        ? item.workerNames.map((name) => String(name || '').trim()).filter(Boolean)
        : [],
      statusHistory,
      rawWorkMinutes,
    }
  })
}
