import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { addMaintenanceTravelToWorkMinutes } from '@/lib/maintenanceCenterTravel'
import { loadMaintenancePreventiusForInformes } from '@/lib/informes/loadMaintenancePreventiusForInformes'
import { loadMaintenanceTravelIndexForInformes } from '@/lib/informes/loadMaintenanceTravelIndex'
import {
  flattenMaintenanceLocationNodes,
  getMaintenanceCenterOptions,
  getMaintenanceLocationsForCenter,
  getMaintenanceZones,
  matchesMaintenanceSiteFilters,
  sanitizeMaintenanceInternalLocations,
  sanitizeMaintenanceLocationNodes,
} from '@/lib/maintenanceLocationCatalog'
import {
  resolvePreventiuWorkMinutesForReport,
  resolveTicketWorkMinutesForReport,
  workInvolvesOperator,
  type StatusHistoryEntry,
} from '@/lib/informes/maintenanceTicketMetrics'
import type { MaintenanceWorkLogEntry } from '@/lib/maintenanceWorkLogs'
import type {
  MaintenanceAssigneeRow,
  MaintenanceKpiCard,
  MaintenanceLocationRow,
  MaintenanceMonthSeriesRow,
  MaintenanceOverview,
  MaintenanceReportContext,
  MaintenanceSelectOption,
  MaintenanceStatusBucket,
  MaintenanceWorkReportRow,
} from '@/lib/informes/maintenanceOverview'

type BuildParams = {
  mode: 'rolling' | 'range' | 'custom'
  days?: number
  dateFrom?: string
  dateTo?: string
  status?: string
  priority?: string
  center?: string
  location?: string
  zone?: string
  ticketType?: string
  interventionType?: string
  assigneeId?: string
  operatorId?: string
}

type TicketRecord = Record<string, unknown> & {
  ticketCode?: string
  incidentNumber?: string
  location?: string
  machine?: string
  status?: string
  priority?: string
  ticketType?: string
  createdAt?: string | number | { toDate?: () => Date }
  plannedStart?: string | number | { toDate?: () => Date } | null
  resolvedAt?: string | number | { toDate?: () => Date } | null
  externalized?: boolean
  assignedToNames?: string[]
  assignedToIds?: string[]
  statusHistory?: StatusHistoryEntry[]
  workLogs?: MaintenanceWorkLogEntry[]
}

type InternalWorkItem = {
  kind: 'ticket' | 'preventiu'
  id: string
  code: string
  eventAtMs: number
  createdAt: string
  lastActivityAt?: string
  location: string
  machine: string
  status: string
  priority: string
  category: string
  originalWorkerIds?: string[]
  workerIds: string[]
  workerNames: string[]
  statusHistory: StatusHistoryEntry[]
  workLogs?: MaintenanceWorkLogEntry[]
  rawWorkMinutes: number
  plannedMinutes: number
  externalized: boolean
}

const STATUS_LABELS: Record<string, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  reassignat: 'Reassignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  validat: 'Validat',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

const CLOSED_STATUSES = new Set(['validat', 'fet'])

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function parseCreatedAtMs(value: TicketRecord['createdAt']): number {
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function parseAnyTimestampMs(
  value?: string | number | { toDate?: () => Date } | null
): number {
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toYmd(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toIsoOrEmpty(ms: number): string {
  return ms > 0 ? new Date(ms).toISOString() : ''
}

function ymdToMsStart(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

function ymdToMsEnd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('ca-ES', {
    month: 'short',
    year: '2-digit',
  })
}

function uniqueLabeledOptions(
  values: string[],
  labelFor: (value: string) => string
): MaintenanceSelectOption[] {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => labelFor(a).localeCompare(labelFor(b), 'ca'))
    .map((value) => ({ value, label: labelFor(value) }))
}

async function loadMaintenanceCentersForReports() {
  const snap = await db.collection('finques').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      const locationNodes = sanitizeMaintenanceLocationNodes(
        data.maintenanceLocationNodes,
        data.maintenanceInternalLocations
      )
      return {
        id: doc.id,
        name: String(data.nom || data.name || '').trim(),
        code: String(data.codi || data.code || doc.id || '').trim(),
        tipus: String(data.tipus || '').trim(),
        internalLocations: locationNodes.length
          ? flattenMaintenanceLocationNodes(locationNodes)
          : sanitizeMaintenanceInternalLocations(data.maintenanceInternalLocations),
        locationNodes,
      }
    })
    .filter((row) => row.name)
}

function resolveAssigneeNamesForAggregation(
  item: InternalWorkItem,
  operatorId: string,
  personnelOptions: MaintenanceSelectOption[]
): string[] {
  if (!operatorId) {
    return item.workerNames.length ? item.workerNames : ['Sense assignar']
  }

  const matchedNames = item.workerIds
    .map((id, index) => (id === operatorId ? item.workerNames[index] || '' : ''))
    .map((name) => String(name || '').trim())
    .filter(Boolean)

  if (matchedNames.length > 0) return matchedNames

  const fallback = personnelOptions.find((option) => option.value === operatorId)?.label?.trim() || ''
  return fallback ? [fallback] : ['Sense assignar']
}

function parseEntryAtMs(entry?: { at?: number | string | null } | null): number {
  if (!entry) return 0
  const raw = entry.at
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function resolveTicketLastActivityMs(data: TicketRecord): number {
  const createdAtMs = parseCreatedAtMs(data.createdAt)
  const plannedStartMs = parseAnyTimestampMs(data.plannedStart)
  const resolvedAtMs = parseAnyTimestampMs(data.resolvedAt)
  const latestStatusMs = Array.isArray(data.statusHistory)
    ? data.statusHistory.reduce((max, entry) => {
        const atMs = parseEntryAtMs(entry)
        return atMs > max ? atMs : max
      }, 0)
    : 0
  const latestWorkLogMs = Array.isArray(data.workLogs)
    ? data.workLogs.reduce((max, entry) => {
        const atMs = parseEntryAtMs(entry)
        return atMs > max ? atMs : max
      }, 0)
    : 0

  return Math.max(createdAtMs, plannedStartMs, resolvedAtMs, latestStatusMs, latestWorkLogMs)
}

function resolveOperatorDisplayName(
  item: InternalWorkItem,
  operatorId: string,
  personnelOptions: MaintenanceSelectOption[]
): string {
  const index = item.workerIds.findIndex((id) => id === operatorId)
  const fromItem = index >= 0 ? String(item.workerNames[index] || '').trim() : ''
  if (fromItem) return fromItem
  return personnelOptions.find((option) => option.value === operatorId)?.label?.trim() || operatorId
}

function applyOperatorProjection(
  item: InternalWorkItem,
  operatorId: string,
  personnelOptions: MaintenanceSelectOption[]
): InternalWorkItem {
  if (!operatorId) return item

  const operatorName = resolveOperatorDisplayName(item, operatorId, personnelOptions)
  const lastStatusEntry = item.statusHistory
    .filter((entry) => String(entry?.byId || '').trim() === operatorId)
    .map((entry) => ({
      status: normalizeText((entry as StatusHistoryEntry & { status?: string }).status) || item.status,
      atMs: parseEntryAtMs(entry),
    }))
    .sort((a, b) => a.atMs - b.atMs)
    .at(-1)

  const lastWorkLogAtMs = Array.isArray(item.workLogs)
    ? item.workLogs
        .filter((entry) => String(entry?.byId || '').trim() === operatorId)
        .map((entry) => parseEntryAtMs(entry))
        .reduce((max, value) => (value > max ? value : max), 0)
    : 0

  const operatorActivityAtMs = Math.max(lastStatusEntry?.atMs || 0, lastWorkLogAtMs)
  const lastActivityAtMs = operatorActivityAtMs > 0 ? operatorActivityAtMs : item.eventAtMs

  return {
    ...item,
    eventAtMs: lastActivityAtMs,
    lastActivityAt: toIsoOrEmpty(lastActivityAtMs),
    status: lastStatusEntry?.status || item.status,
    workerIds: operatorName ? [operatorId] : item.workerIds,
    workerNames: operatorName ? [operatorName] : item.workerNames,
  }
}

function resolveWindow(params: BuildParams): { fromMs: number; toMs: number; context: MaintenanceReportContext } {
  const now = Date.now()
  if (params.mode === 'rolling') {
    const days = Math.min(365, Math.max(7, params.days || 30))
    const fromMs = now - days * 86_400_000
    return { fromMs, toMs: now, context: { kind: 'rolling', days } }
  }

  const dateFrom = params.dateFrom || toYmd(now - 29 * 86_400_000)
  const dateTo = params.dateTo || toYmd(now)
  const fromMs = ymdToMsStart(dateFrom)
  const toMs = ymdToMsEnd(dateTo)
  const operatorId = params.operatorId || params.assigneeId

  if (params.mode === 'custom') {
    return {
      fromMs,
      toMs,
      context: {
        kind: 'custom',
        dateFrom,
        dateTo,
        status: params.status || undefined,
        priority: params.priority || undefined,
        center: params.center || undefined,
        location: params.location || undefined,
        zone: params.zone || undefined,
        ticketType: params.ticketType || undefined,
        interventionType: params.interventionType || undefined,
        assigneeId: operatorId || undefined,
        operatorId: operatorId || undefined,
      },
    }
  }

  return { fromMs, toMs, context: { kind: 'range', dateFrom, dateTo } }
}

function toReportRow(item: InternalWorkItem & {
  workMinutes: number
  travelMinutes: number
  totalMinutes: number
}): MaintenanceWorkReportRow {
  return {
    id: item.id,
    kind: item.kind,
    code: item.code,
    createdAt: item.createdAt,
    lastActivityAt: item.lastActivityAt || item.createdAt,
    location: item.location,
    machine: item.machine,
    status: STATUS_LABELS[item.status] || item.status,
    priority: PRIORITY_LABELS[item.priority] || item.priority,
    category:
      item.kind === 'preventiu'
        ? 'Preventiu'
        : item.category === 'deco'
          ? 'Decoració'
          : 'Maquinària',
    assignees: item.workerNames.join(', ') || '—',
    workMinutes: item.workMinutes,
    travelMinutes: item.travelMinutes,
    totalMinutes: item.totalMinutes,
    externalized: item.kind === 'ticket' ? item.externalized : undefined,
  }
}

async function loadMaintenancePersonnelOptions(): Promise<MaintenanceSelectOption[]> {
  const snap = await db.collection('personnel').where('departmentLower', '==', 'manteniment').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as { name?: string }
      const id = doc.id
      const name = String(data.name || id).trim()
      return { value: id, label: name }
    })
    .filter((row) => row.value)
    .sort((a, b) => a.label.localeCompare(b.label, 'ca'))
}

export async function buildMaintenanceOverview(params: BuildParams): Promise<MaintenanceOverview> {
  const operatorId = String(params.operatorId || params.assigneeId || '').trim()
  const travelIndex = await loadMaintenanceTravelIndexForInformes()

  const [ticketSnap, preventiusRaw, personnelOperators, maintenanceCenters] = await Promise.all([
    db.collection('maintenanceTickets').get(),
    loadMaintenancePreventiusForInformes(),
    loadMaintenancePersonnelOptions(),
    loadMaintenanceCentersForReports(),
  ])

  const allItems: InternalWorkItem[] = []

  for (const doc of ticketSnap.docs) {
    const data = doc.data() as TicketRecord
    const createdAtMs = parseCreatedAtMs(data.createdAt)
    const eventAtMs = resolveTicketLastActivityMs(data) || createdAtMs
    const assigneeNames = Array.isArray(data.assignedToNames)
      ? data.assignedToNames.map((n) => String(n || '').trim()).filter(Boolean)
      : []
    const assigneeIds = Array.isArray(data.assignedToIds)
      ? data.assignedToIds.map((n) => String(n || '').trim()).filter(Boolean)
      : []
    allItems.push({
      kind: 'ticket',
      id: doc.id,
      code: String(data.ticketCode || data.incidentNumber || doc.id).trim(),
      eventAtMs,
      createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : '',
      lastActivityAt: eventAtMs ? new Date(eventAtMs).toISOString() : '',
      location: String(data.location || '').trim(),
      machine: String(data.machine || '').trim(),
      status: normalizeText(data.status) || 'nou',
      priority: normalizeText(data.priority) || 'normal',
      category: normalizeText(data.ticketType) || 'maquinaria',
      originalWorkerIds: assigneeIds,
      workerIds: assigneeIds,
      workerNames: assigneeNames,
      statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
      workLogs: Array.isArray(data.workLogs) ? (data.workLogs as MaintenanceWorkLogEntry[]) : [],
      rawWorkMinutes: 0,
      plannedMinutes: 0,
      externalized: Boolean(data.externalized),
    })
  }

  for (const preventiu of preventiusRaw) {
    allItems.push({
      kind: 'preventiu',
      id: preventiu.id,
      code: preventiu.title,
      eventAtMs: preventiu.eventAtMs,
      createdAt: preventiu.createdAt,
      location: preventiu.location,
      machine: '',
      status: preventiu.status,
      priority: preventiu.priority,
      category: 'preventiu',
      originalWorkerIds: preventiu.workerIds,
      workerIds: preventiu.workerIds,
      workerNames: preventiu.workerNames,
      statusHistory: preventiu.statusHistory,
      rawWorkMinutes: preventiu.rawWorkMinutes,
      plannedMinutes: preventiu.rawWorkMinutes,
      externalized: false,
    })
  }

  const { fromMs, toMs, context } = resolveWindow(params)

  const inWindow = allItems.filter((item) => item.eventAtMs >= fromMs && item.eventAtMs <= toMs)

  const withMetrics = inWindow.map((item) => {
    const scopedItem = applyOperatorProjection(item, operatorId, personnelOperators)
    const workMinutesRaw =
      scopedItem.kind === 'ticket'
        ? resolveTicketWorkMinutesForReport(
            scopedItem.statusHistory,
            scopedItem.workerIds,
            operatorId || undefined,
            scopedItem.workLogs
          )
        : resolvePreventiuWorkMinutesForReport(
            scopedItem.statusHistory,
            scopedItem.workerIds,
            scopedItem.plannedMinutes,
            operatorId || undefined
          )
    const travelBreakdown = addMaintenanceTravelToWorkMinutes(
      workMinutesRaw,
      scopedItem.location,
      travelIndex
    )
    return {
      ...scopedItem,
      workMinutes: travelBreakdown.workMinutes,
      travelMinutes: travelBreakdown.travelMinutes,
      totalMinutes: travelBreakdown.totalMinutes,
    }
  })

  const filtered = withMetrics.filter((item) => {
    if (params.mode !== 'custom') return true
    if (params.status && item.status !== normalizeText(params.status)) return false
    if (params.priority && item.priority !== normalizeText(params.priority)) return false
    if (
      !matchesMaintenanceSiteFilters(
        maintenanceCenters,
        {
          center: params.center || '',
          location: params.location || '',
          zone: params.zone || '',
        },
        item.location
      )
    ) {
      return false
    }
    if (params.interventionType) {
      const type = normalizeText(params.interventionType)
      if (type === 'preventiu' && item.kind !== 'preventiu') return false
      if (type === 'ticket_internal' && (item.kind !== 'ticket' || item.externalized)) return false
      if (type === 'ticket_externalized' && (item.kind !== 'ticket' || !item.externalized)) return false
    }
    if (params.ticketType) {
      if (item.kind !== 'ticket') return false
      if (item.category !== normalizeText(params.ticketType)) return false
    }
    if (
      operatorId &&
      !workInvolvesOperator(item.originalWorkerIds || item.workerIds, item.statusHistory, operatorId, item.workLogs)
    ) {
      return false
    }
    if (operatorId && item.workMinutes <= 0 && item.travelMinutes <= 0) return false
    return true
  })

  const statusCounts = new Map<string, number>()
  const priorityCounts = new Map<string, number>()
  const monthMap = new Map<string, MaintenanceMonthSeriesRow>()
  const locationMap = new Map<string, MaintenanceLocationRow>()
  const assigneeMap = new Map<string, MaintenanceAssigneeRow>()

  let totalWork = 0
  let totalTravel = 0
  let totalCombined = 0
  let ticketCount = 0
  let preventiuCount = 0
  let openCount = 0
  let closedCount = 0
  let externalizedCount = 0

  for (const item of filtered) {
    totalWork += item.workMinutes
    totalTravel += item.travelMinutes
    totalCombined += item.totalMinutes
    if (item.kind === 'ticket') ticketCount += 1
    else preventiuCount += 1
    if (CLOSED_STATUSES.has(item.status)) closedCount += 1
    else openCount += 1
    if (item.externalized) externalizedCount += 1

    statusCounts.set(item.status, (statusCounts.get(item.status) || 0) + 1)
    priorityCounts.set(item.priority, (priorityCounts.get(item.priority) || 0) + 1)

    const monthKey = item.eventAtMs
      ? `${new Date(item.eventAtMs).getFullYear()}-${String(new Date(item.eventAtMs).getMonth() + 1).padStart(2, '0')}`
      : 'unknown'
    const monthRow = monthMap.get(monthKey) || {
      month: monthKey,
      label: monthKey === 'unknown' ? 'Sense data' : formatMonthLabel(monthKey),
      tickets: 0,
      preventius: 0,
      workMinutes: 0,
      travelMinutes: 0,
      totalMinutes: 0,
    }
    if (item.kind === 'ticket') monthRow.tickets += 1
    else monthRow.preventius += 1
    monthRow.workMinutes += item.workMinutes
    monthRow.travelMinutes += item.travelMinutes
    monthRow.totalMinutes += item.totalMinutes
    monthMap.set(monthKey, monthRow)

    const locKey = item.location || 'Sense ubicació'
    const locRow = locationMap.get(locKey) || {
      location: locKey,
      tickets: 0,
      externalizedTickets: 0,
      preventius: 0,
      workMinutes: 0,
      travelMinutes: 0,
      totalMinutes: 0,
    }
    if (item.kind === 'ticket') locRow.tickets += 1
    else locRow.preventius += 1
    if (item.kind === 'ticket' && item.externalized) locRow.externalizedTickets += 1
    locRow.workMinutes += item.workMinutes
    locRow.travelMinutes += item.travelMinutes
    locRow.totalMinutes += item.totalMinutes
    locationMap.set(locKey, locRow)

    const names = resolveAssigneeNamesForAggregation(item, operatorId, personnelOperators)
    for (const name of names) {
      const row = assigneeMap.get(name) || {
        name,
        tickets: 0,
        externalizedTickets: 0,
        preventius: 0,
        workMinutes: 0,
        totalMinutes: 0,
      }
      if (item.kind === 'ticket') row.tickets += 1
      else row.preventius += 1
      if (item.kind === 'ticket' && item.externalized) row.externalizedTickets += 1
      row.workMinutes += item.workMinutes
      row.totalMinutes += item.totalMinutes
      assigneeMap.set(name, row)
    }
  }

  const statusBuckets: MaintenanceStatusBucket[] = [...statusCounts.entries()]
    .map(([key, value]) => ({ label: STATUS_LABELS[key] || key, value }))
    .sort((a, b) => b.value - a.value)

  const priorityBuckets: MaintenanceStatusBucket[] = [...priorityCounts.entries()]
    .map(([key, value]) => ({ label: PRIORITY_LABELS[key] || key, value }))
    .sort((a, b) => b.value - a.value)

  const monthlySeries = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month))

  const topLocations = [...locationMap.values()]
    .sort(
      (a, b) =>
        b.totalMinutes - a.totalMinutes ||
        b.tickets + b.preventius - (a.tickets + a.preventius)
    )
    .slice(0, 12)

  const topAssignees = [...assigneeMap.values()]
    .sort(
      (a, b) =>
        b.totalMinutes - a.totalMinutes ||
        b.tickets + b.preventius - (a.tickets + a.preventius)
    )
    .slice(0, 10)

  const entries: MaintenanceWorkReportRow[] = filtered
    .sort((a, b) => b.eventAtMs - a.eventAtMs)
    .map((item) => toReportRow(item))

  const closedItems = filtered.filter((item) => CLOSED_STATUSES.has(item.status))
  const avgTotalClosed =
    closedItems.length > 0 ? Math.round(totalCombined / closedItems.length) : 0

  const kpis: MaintenanceKpiCard[] = [
    {
      label: 'Intervencions',
      value: filtered.length,
      hint: `${ticketCount} tickets · ${preventiuCount} preventius`,
    },
    {
      label: 'Tickets',
      value: ticketCount,
      hint: 'Incidències al període',
    },
    {
      label: 'Tickets interns',
      value: ticketCount - externalizedCount,
      hint: 'Gestionats internament',
    },
    {
      label: 'Preventius',
      value: preventiuCount,
      hint: 'Planificats al període (data tancament o planificada)',
    },
    {
      label: 'Oberts',
      value: openCount,
      hint: 'Encara no tancats (fet/validat)',
    },
    {
      label: 'Tancats',
      value: closedCount,
      hint: 'Estat fet o validat',
    },
    {
      label: 'Externalitzats',
      value: externalizedCount,
      hint: 'Només tickets enviats a proveïdor',
    },
    {
      label: 'Hores treball',
      value: Math.round(totalWork / 60),
      hint: 'Segments de jornada registrats',
    },
    {
      label: 'Hores desplaçament',
      value: Math.round(totalTravel / 60),
      hint: 'Anada + tornada segons centres',
    },
    {
      label: 'Hores totals',
      value: Math.round(totalCombined / 60),
      hint: 'Treball + desplaçament',
    },
    {
      label: 'Mitjana h/tancat',
      value: Math.round(avgTotalClosed / 60),
      hint: 'Hores totals mitjanes (tickets + preventius)',
    },
  ]

  const optionSource = inWindow
  const assigneesFromData = optionSource
    .flatMap((item) =>
      item.workerIds.map((id, index) => ({
        id,
        name: item.workerNames[index] || id,
      }))
    )
    .filter((row, index, arr) => row.id && arr.findIndex((x) => x.id === row.id) === index)

  const assigneeMapOptions = new Map<string, MaintenanceSelectOption>()
  for (const row of personnelOperators) assigneeMapOptions.set(row.value, row)
  for (const row of assigneesFromData) {
    if (!assigneeMapOptions.has(row.id)) {
      assigneeMapOptions.set(row.id, { value: row.id, label: row.name })
    }
  }

  const filterOptions = {
    statuses: uniqueLabeledOptions(
      optionSource.map((t) => t.status),
      (value) => STATUS_LABELS[value] || value
    ),
    priorities: uniqueLabeledOptions(
      optionSource.map((t) => t.priority),
      (value) => PRIORITY_LABELS[value] || value
    ),
    centers: uniqueLabeledOptions(getMaintenanceCenterOptions(maintenanceCenters), (value) => value),
    interventionTypes: [
      { value: 'ticket_internal', label: 'Tickets interns' },
      { value: 'ticket_externalized', label: 'Tickets externalitzats' },
      { value: 'preventiu', label: 'Preventius' },
    ],
    locations: uniqueLabeledOptions(
      getMaintenanceLocationsForCenter(maintenanceCenters),
      (value) => value
    ),
    zones: uniqueLabeledOptions(getMaintenanceZones(maintenanceCenters), (value) => value),
    ticketTypes: uniqueLabeledOptions(
      optionSource.filter((t) => t.kind === 'ticket').map((t) => t.category),
      (value) => (value === 'deco' ? 'Decoració' : 'Maquinària')
    ),
    assignees: [...assigneeMapOptions.values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'ca')
    ),
  }

  return {
    generatedAt: new Date().toISOString(),
    reportContext: context,
    kpis,
    statusBuckets,
    priorityBuckets,
    monthlySeries,
    topLocations,
    topAssignees,
    entries,
    tickets: entries,
    filterOptions,
  }
}
