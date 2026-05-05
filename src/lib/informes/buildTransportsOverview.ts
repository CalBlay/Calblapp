import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  orderedDayRangeFromISOStrings,
  queryQuadrantCollectionDocsInDateRange,
} from '@/lib/firestoreQuadrantsRangeQuery'
import { TRANSPORT_TYPE_LABELS, normalizeTransportPlateKey } from '@/lib/transportTypes'
import type {
  TransportAssignmentReportRow,
  TransportCriticalVehicleRow,
  TransportKpiCard,
  TransportMonthSeriesRow,
  TransportSelectOption,
  TransportStatusBucket,
  TransportsOverview,
  TransportsReportContext,
} from '@/lib/informes/transportsOverview'

type MonthlyMileageEntry = {
  month?: string
  km?: number
}

type TransportRecord = {
  id: string
  plate: string
  type: string
  conductorId?: string | null
  available?: boolean
  documents?: unknown[]
  itvExpiry?: string | null
  lastService?: string | null
  lastServiceKm?: number | null
  monthlyMileage?: MonthlyMileageEntry[]
}

type StageVerdEventRecord = Record<string, unknown> & {
  code?: string
  DataInici?: string
  HoraInici?: string
  HoraFi?: string
  NomEvent?: string
  Ubicacio?: string
  NumPax?: number | string
}

type QuadrantConductorRecord = {
  id?: string
  name?: string
  plate?: string
  vehicleType?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
}

type QuadrantRecord = Record<string, unknown> & {
  code?: string
  eventId?: string
  status?: string
  transportRequested?: boolean
  numDrivers?: number | string
  conductors?: QuadrantConductorRecord[]
}

type BuildParams = {
  year: number
  month?: string
  plate?: string
  conductor?: string
  vehicleType?: string
  eventQuery?: string
  mode: 'year' | 'custom'
}

type ReviewState = 'ok' | 'upcoming' | 'overdue' | 'missing'
type ItvState = 'ok' | 'upcoming' | 'expired' | 'missing'

type TransportWithMeta = TransportRecord & {
  typeLabel: string
  driverName: string
  latestKm: number | null
  reviewState: ReviewState
  reviewLabel: string
  itvState: ItvState
  itvLabel: string
}

const DAY_MS = 1000 * 60 * 60 * 24
const DEPTS = ['logistica', 'cuina', 'serveis'] as const

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function normalizeText(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  if (!year || !monthNum) return month
  return new Date(year, monthNum - 1, 1).toLocaleDateString('ca-ES', {
    month: 'short',
  })
}

function formatDateLabel(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ca-ES')
}

function parseYearMonth(month: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  }
}

function monthKeyFromDay(day: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : ''
}

function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}

function latestMileage(entries?: MonthlyMileageEntry[]): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null
  return entries.reduce<number | null>((acc, entry) => {
    const km = Number(entry?.km)
    if (!Number.isFinite(km) || km < 0) return acc
    return acc == null ? km : Math.max(acc, km)
  }, null)
}

function yearlyMileageDeltas(entries: MonthlyMileageEntry[] | undefined, year: number): Map<string, number> {
  const sorted = Array.isArray(entries)
    ? entries
        .map((entry) => {
          const month = String(entry?.month || '').trim()
          const km = Number(entry?.km)
          if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(km) || km < 0) return null
          return { month, km }
        })
        .filter((entry): entry is { month: string; km: number } => entry !== null)
        .sort((a, b) => a.month.localeCompare(b.month))
    : []

  const result = new Map<string, number>()
  let previousKm: number | null = null

  sorted.forEach((entry) => {
    const parsed = parseYearMonth(entry.month)
    if (!parsed) return
    const delta = previousKm == null ? 0 : Math.max(0, entry.km - previousKm)
    previousKm = entry.km
    if (parsed.year !== year) return
    result.set(entry.month, delta)
  })

  return result
}

function reviewThreshold(type: string): number {
  return type === 'camioGran' || type === 'camioGranFred' ? 40000 : 20000
}

function computeReviewState(transport: TransportRecord, today: Date, lastKm: number | null) {
  const lastService = String(transport.lastService || '').trim()
  if (!lastService) {
    return { state: 'missing' as const, label: 'Sense ultima revisio' }
  }

  const lastServiceDate = new Date(`${lastService.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(lastServiceDate.getTime())) {
    return { state: 'missing' as const, label: 'Sense ultima revisio valida' }
  }

  const annualDueDate = new Date(lastServiceDate)
  annualDueDate.setFullYear(annualDueDate.getFullYear() + 1)
  const diffDays = Math.round((annualDueDate.getTime() - today.getTime()) / DAY_MS)

  const lastServiceKm =
    typeof transport.lastServiceKm === 'number' &&
    Number.isFinite(transport.lastServiceKm) &&
    transport.lastServiceKm >= 0
      ? transport.lastServiceKm
      : null

  if (
    typeof lastKm === 'number' &&
    typeof lastServiceKm === 'number' &&
    lastKm >= lastServiceKm
  ) {
    const deltaKm = lastKm - lastServiceKm
    const threshold = reviewThreshold(transport.type)
    if (deltaKm >= threshold) {
      return {
        state: 'overdue' as const,
        label: `Revisio km vencuda (${new Intl.NumberFormat('ca-ES').format(deltaKm)} km)`,
      }
    }
    if (threshold - deltaKm <= Math.max(2000, threshold * 0.1)) {
      return {
        state: 'upcoming' as const,
        label: `Revisio propera per km (${new Intl.NumberFormat('ca-ES').format(deltaKm)} km)`,
      }
    }
  }

  if (diffDays < 0) {
    return {
      state: 'overdue' as const,
      label: `Revisio anual vencuda des del ${formatDateLabel(annualDueDate.toISOString())}`,
    }
  }
  if (diffDays <= 30) {
    return {
      state: 'upcoming' as const,
      label: `Revisio anual en ${diffDays} dies`,
    }
  }

  return { state: 'ok' as const, label: 'Revisio al dia' }
}

function computeItvState(transport: TransportRecord, today: Date) {
  const expiry = String(transport.itvExpiry || '').trim()
  if (!expiry) {
    return { state: 'missing' as const, label: 'Sense data ITV' }
  }
  const expiryDate = new Date(`${expiry.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(expiryDate.getTime())) {
    return { state: 'missing' as const, label: 'Sense data ITV valida' }
  }
  const diffDays = Math.round((expiryDate.getTime() - today.getTime()) / DAY_MS)
  if (diffDays < 0) {
    return { state: 'expired' as const, label: `ITV caducada des del ${formatDateLabel(expiry)}` }
  }
  if (diffDays <= 7) {
    return { state: 'upcoming' as const, label: `ITV caduca en ${diffDays} dies` }
  }
  return { state: 'ok' as const, label: `ITV vigent fins ${formatDateLabel(expiry)}` }
}

function normalizeStageKey(raw?: string) {
  return String(raw ?? '')
    .trim()
    .split('__')[0]
    .trim()
}

function resolveStageCodeForQuadrant(
  q: QuadrantRecord,
  docId: string,
  map: Map<string, StageVerdEventRecord>
): string | null {
  const tryKey = (k: string) => {
    const normalized = normalizeStageKey(k)
    return normalized && map.has(normalized) ? normalized : null
  }
  return (
    tryKey(String(q?.code ?? '')) ||
    tryKey(String(q?.eventId ?? '')) ||
    tryKey(docId)
  )
}

function quadrantNeedsAssignacionsTransport(q: QuadrantRecord): boolean {
  const conductors = Array.isArray(q.conductors) ? q.conductors : []
  const hasDemand =
    Boolean(q.transportRequested) || Number(q.numDrivers || 0) > 0
  return hasDemand || conductors.length > 0
}

async function readDriverNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (!uniqueIds.length) return new Map()
  const refs = uniqueIds.map((id) => firestoreAdmin.collection('personnel').doc(id))
  const docs = await firestoreAdmin.getAll(...refs)
  const map = new Map<string, string>()
  docs.forEach((doc) => {
    const data = doc.data() as { name?: string } | undefined
    map.set(doc.id, String(data?.name || '').trim())
  })
  return map
}

async function readAssignments(start: string, end: string): Promise<TransportAssignmentReportRow[]> {
  const dayRange = orderedDayRangeFromISOStrings(start, end)
  if (!dayRange) return []

  const eventsSnap = await firestoreAdmin
    .collection('stage_verd')
    .where('DataInici', '>=', start)
    .where('DataInici', '<=', end)
    .get()

  const eventMap = new Map<string, StageVerdEventRecord>()
  eventsSnap.docs.forEach((doc) => {
    const data = doc.data() as StageVerdEventRecord
    if (!data?.code) return
    eventMap.set(String(data.code), data)
  })

  const rows: TransportAssignmentReportRow[] = []

  for (const dept of DEPTS) {
    const collection = firestoreAdmin.collection(`quadrants${cap(dept)}`)
    const { docs } = await queryQuadrantCollectionDocsInDateRange(
      collection,
      dayRange.start,
      dayRange.end
    )

    docs.forEach((doc) => {
      const quadrant = doc.data() as QuadrantRecord
      const stageCode = resolveStageCodeForQuadrant(quadrant, doc.id, eventMap)
      if (!stageCode || !quadrantNeedsAssignacionsTransport(quadrant)) return

      const event = eventMap.get(stageCode)
      if (!event) return

      const conductors = Array.isArray(quadrant.conductors) ? quadrant.conductors : []
      conductors.forEach((row) => {
        rows.push({
          eventCode: stageCode,
          day: String(event.DataInici || ''),
          month: monthKeyFromDay(String(event.DataInici || '')),
          eventName: String(event.NomEvent || '—'),
          location: String(event.Ubicacio || '—'),
          pax: Number(event.NumPax || 0),
          status: quadrant.status === 'confirmed' ? 'confirmed' : 'draft',
          department: dept,
          driverName: String(row?.name || '').trim(),
          plate: String(row?.plate || '').trim(),
          vehicleType: String(row?.vehicleType || '').trim(),
          startTime: String(row?.startTime || ''),
          arrivalTime: String(row?.arrivalTime || ''),
          endTime: String(row?.endTime || ''),
        })
      })
    })
  }

  return rows.sort((a, b) => {
    if (a.day !== b.day) return a.day.localeCompare(b.day)
    if (a.eventName !== b.eventName) return a.eventName.localeCompare(b.eventName)
    return a.plate.localeCompare(b.plate)
  })
}

function buildFilterOptions(
  year: number,
  transports: TransportWithMeta[],
  assignments: TransportAssignmentReportRow[]
) {
  const months: TransportSelectOption[] = monthsOfYear(year).map((month) => ({
    value: month,
    label: formatMonthLabel(month),
  }))

  const vehicles: TransportSelectOption[] = transports
    .map((transport) => ({
      value: transport.plate,
      label: `${transport.plate} · ${transport.typeLabel}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const drivers: TransportSelectOption[] = Array.from(
    new Set(
      [
        ...transports.map((transport) => transport.driverName),
        ...assignments.map((row) => row.driverName),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }))

  const vehicleTypes: TransportSelectOption[] = Array.from(
    new Set(transports.map((transport) => transport.type).filter(Boolean))
  )
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      value,
      label: TRANSPORT_TYPE_LABELS[value] || value,
    }))

  return { months, vehicles, drivers, vehicleTypes }
}

export async function buildTransportsOverview(params: BuildParams): Promise<TransportsOverview> {
  const year = Number.isFinite(params.year) ? params.year : new Date().getFullYear()
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const transportsSnap = await firestoreAdmin.collection('transports').get()
  const transportDocs = transportsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TransportRecord, 'id'>),
  })) as TransportRecord[]

  const driverNames = await readDriverNames(
    transportDocs.map((transport) => String(transport.conductorId || '').trim()).filter(Boolean)
  )

  const transports: TransportWithMeta[] = transportDocs.map((transport) => {
    const plate = String(transport.plate || '').trim()
    const type = String(transport.type || '').trim()
    const typeLabel = TRANSPORT_TYPE_LABELS[type] || type || 'Sense tipus'
    const driverName = driverNames.get(String(transport.conductorId || '').trim()) || ''
    const latestKm = latestMileage(transport.monthlyMileage)
    const review = computeReviewState(transport, today, latestKm)
    const itv = computeItvState(transport, today)

    return {
      ...transport,
      plate,
      type,
      typeLabel,
      driverName,
      latestKm,
      reviewState: review.state,
      reviewLabel: review.label,
      itvState: itv.state,
      itvLabel: itv.label,
    }
  })

  const assignmentRowsBase = await readAssignments(start, end)
  const filterOptions = buildFilterOptions(year, transports, assignmentRowsBase)

  const plateFilter = String(params.plate || '').trim()
  const conductorFilter = String(params.conductor || '').trim()
  const monthFilter = String(params.month || '').trim()
  const typeFilter = String(params.vehicleType || '').trim()
  const eventQueryFilter = normalizeText(params.eventQuery)

  const filteredTransports = transports.filter((transport) => {
    if (plateFilter && transport.plate !== plateFilter) return false
    if (typeFilter && transport.type !== typeFilter) return false
    if (conductorFilter && transport.driverName !== conductorFilter) return false
    return true
  })

  const allowedPlates = new Set(
    (plateFilter ? filteredTransports : transports).map((transport) => normalizeTransportPlateKey(transport.plate))
  )

  const assignmentRows = assignmentRowsBase.filter((row) => {
    if (monthFilter && row.month !== monthFilter) return false
    if (typeFilter && row.vehicleType !== typeFilter) return false
    if (conductorFilter && row.driverName !== conductorFilter) return false
    if (plateFilter && normalizeTransportPlateKey(row.plate) !== normalizeTransportPlateKey(plateFilter)) {
      return false
    }
    if (!plateFilter && allowedPlates.size && row.plate && !allowedPlates.has(normalizeTransportPlateKey(row.plate))) {
      return false
    }
    if (
      eventQueryFilter &&
      !normalizeText(row.eventName).includes(eventQueryFilter) &&
      !normalizeText(row.location).includes(eventQueryFilter) &&
      !normalizeText(row.eventCode).includes(eventQueryFilter)
    ) {
      return false
    }
    return true
  })

  const assignmentVehiclesByPlate = new Map<string, { assignments: number; driverName: string; vehicleType: string }>()
  assignmentRows.forEach((row) => {
    const key = normalizeTransportPlateKey(row.plate)
    if (!key) return
    const current = assignmentVehiclesByPlate.get(key) || {
      assignments: 0,
      driverName: row.driverName,
      vehicleType: row.vehicleType,
    }
    current.assignments += 1
    if (!current.driverName && row.driverName) current.driverName = row.driverName
    if (!current.vehicleType && row.vehicleType) current.vehicleType = row.vehicleType
    assignmentVehiclesByPlate.set(key, current)
  })

  const monthlyKmMap = new Map<string, number>()
  monthsOfYear(year).forEach((month) => monthlyKmMap.set(month, 0))
  filteredTransports.forEach((transport) => {
    const deltas = yearlyMileageDeltas(transport.monthlyMileage, year)
    deltas.forEach((km, month) => {
      if (monthFilter && month !== monthFilter) return
      monthlyKmMap.set(month, (monthlyKmMap.get(month) || 0) + km)
    })
  })

  const monthlyAssignmentsMap = new Map<string, number>()
  monthsOfYear(year).forEach((month) => monthlyAssignmentsMap.set(month, 0))
  assignmentRows.forEach((row) => {
    if (!row.month) return
    monthlyAssignmentsMap.set(row.month, (monthlyAssignmentsMap.get(row.month) || 0) + 1)
  })

  const monthlySeries: TransportMonthSeriesRow[] = monthsOfYear(year)
    .filter((month) => !monthFilter || month === monthFilter)
    .map((month) => ({
      month,
      label: formatMonthLabel(month),
      km: monthlyKmMap.get(month) || 0,
      assignments: monthlyAssignmentsMap.get(month) || 0,
    }))

  const reviewBuckets: TransportStatusBucket[] = [
    {
      label: 'Al dia',
      value: filteredTransports.filter((transport) => transport.reviewState === 'ok').length,
    },
    {
      label: 'Propera',
      value: filteredTransports.filter((transport) => transport.reviewState === 'upcoming').length,
    },
    {
      label: 'Vencuda',
      value: filteredTransports.filter((transport) => transport.reviewState === 'overdue').length,
    },
    {
      label: 'Sense dada',
      value: filteredTransports.filter((transport) => transport.reviewState === 'missing').length,
    },
  ]

  const itvBuckets: TransportStatusBucket[] = [
    {
      label: 'Vigent',
      value: filteredTransports.filter((transport) => transport.itvState === 'ok').length,
    },
    {
      label: 'Propera',
      value: filteredTransports.filter((transport) => transport.itvState === 'upcoming').length,
    },
    {
      label: 'Caducada',
      value: filteredTransports.filter((transport) => transport.itvState === 'expired').length,
    },
    {
      label: 'Sense dada',
      value: filteredTransports.filter((transport) => transport.itvState === 'missing').length,
    },
  ]

  const topVehicles = [...filteredTransports]
    .map((transport) => {
      const assignmentMeta = assignmentVehiclesByPlate.get(normalizeTransportPlateKey(transport.plate))
      return {
        plate: transport.plate,
        type: transport.typeLabel,
        assignments: assignmentMeta?.assignments || 0,
        driverName: assignmentMeta?.driverName || transport.driverName || '',
      }
    })
    .sort((a, b) => b.assignments - a.assignments || a.plate.localeCompare(b.plate))
    .slice(0, 8)

  const topDriversMap = new Map<string, { assignments: number; vehicles: Set<string> }>()
  assignmentRows.forEach((row) => {
    if (!row.driverName.trim()) return
    const current = topDriversMap.get(row.driverName) || { assignments: 0, vehicles: new Set<string>() }
    current.assignments += 1
    if (row.plate) current.vehicles.add(row.plate)
    topDriversMap.set(row.driverName, current)
  })
  const topDrivers = Array.from(topDriversMap.entries())
    .map(([name, data]) => ({
      name,
      assignments: data.assignments,
      vehicles: data.vehicles.size,
    }))
    .sort((a, b) => b.assignments - a.assignments || a.name.localeCompare(b.name))
    .slice(0, 8)

  const criticalVehicles: TransportCriticalVehicleRow[] = filteredTransports
    .filter((transport) => {
      return (
        transport.reviewState !== 'ok' ||
        transport.itvState !== 'ok' ||
        !Array.isArray(transport.documents) ||
        transport.documents.length === 0
      )
    })
    .map((transport) => ({
      id: transport.id,
      plate: transport.plate,
      type: transport.typeLabel,
      driverName: transport.driverName || 'Sense conductor',
      latestKm: transport.latestKm,
      reviewStatus: transport.reviewLabel,
      itvStatus: transport.itvLabel,
      availability: transport.available === false ? 'No disponible' : 'Disponible',
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate))
    .slice(0, 12)

  const kpis: TransportKpiCard[] = [
    {
      label: 'Vehicles totals',
      value: filteredTransports.length,
      hint: monthFilter ? `Mes ${formatMonthLabel(monthFilter)}` : `Any ${year}`,
    },
    {
      label: 'Disponibles',
      value: filteredTransports.filter((transport) => transport.available !== false).length,
      hint: 'Segons estat actual',
    },
    {
      label: 'Amb conductor',
      value: filteredTransports.filter((transport) => transport.driverName.trim()).length,
      hint: 'Assignacio principal',
    },
    {
      label: 'Revisions vencudes',
      value: reviewBuckets.find((bucket) => bucket.label === 'Vencuda')?.value || 0,
      hint: 'Anuals o per km',
    },
    {
      label: 'ITV caducades',
      value: itvBuckets.find((bucket) => bucket.label === 'Caducada')?.value || 0,
      hint: 'Caducitat superada',
    },
    {
      label: 'Km del periode',
      value: monthlySeries.reduce((sum, row) => sum + row.km, 0),
      hint: 'Diferencial mensual',
    },
    {
      label: 'Assignacions',
      value: assignmentRows.length,
      hint: 'Files de transport',
    },
    {
      label: 'Esdeveniments amb transport',
      value: new Set(assignmentRows.map((row) => `${row.day}__${row.eventCode}`)).size,
      hint: 'Unics al periode',
    },
  ]

  const reportContext: TransportsReportContext =
    params.mode === 'custom'
      ? {
          kind: 'custom',
          year,
          month: monthFilter || undefined,
          plate: plateFilter || undefined,
          conductor: conductorFilter || undefined,
          vehicleType: typeFilter || undefined,
          eventQuery: String(params.eventQuery || '').trim() || undefined,
        }
      : {
          kind: 'year',
          year,
        }

  return {
    generatedAt: new Date().toISOString(),
    reportContext,
    kpis,
    reviewBuckets,
    itvBuckets,
    monthlySeries,
    topVehicles,
    topDrivers,
    criticalVehicles,
    assignments: assignmentRows,
    filterOptions,
  }
}
