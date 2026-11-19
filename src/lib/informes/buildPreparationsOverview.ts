import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { PREPARATION_WAREHOUSE_LABELS, type PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { normalizeDepartmentLabel } from '@/data/departments'
import type {
  PreparationReportDetail,
  PreparationReportSummary,
  PreparationBusinessLineSummary,
  PreparationsOverview,
} from '@/lib/informes/preparationsOverview'

type RawPreparation = Record<string, unknown> & {
  ParentEventId?: unknown
  PreparacioData?: unknown
  PreparacioHora?: unknown
  PreparacioMagatzems?: unknown
}

const REPORT_TIME_ZONE = 'Europe/Madrid'

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function madridWallClockToEpoch(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const [, year, month, day] = dateMatch
  const [, hour, minute] = timeMatch
  const targetAsUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  let epoch = targetAsUtc
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(epoch)).map((part) => [part.type, part.value])
    )
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    )
    epoch += targetAsUtc - representedAsUtc
  }
  return Number.isFinite(epoch) ? epoch : null
}

function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(millis) ? millis : null
  }
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function businessLine(row: RawPreparation, parent?: RawPreparation): string {
  return firstText(
    row.LN,
    row.BusinessLine,
    row.businessLine,
    parent?.LN,
    parent?.BusinessLine,
    parent?.businessLine,
    'Altres'
  )
}

function eventCode(row: RawPreparation): string {
  return firstText(row.ParentEventCode, row.EventCode, row.code, row.Code, row.C_digo, row.codi, row.Codi)
}

function eventName(row: RawPreparation, parent?: RawPreparation): string {
  return firstText(
    row.ParentEventName,
    row.PreparacioNomEvent,
    row.NomEvent,
    row.eventName,
    parent?.PreparacioNomEvent,
    parent?.NomEvent,
    parent?.eventName,
    'Sense nom'
  ).split('/')[0]!.trim()
}

function departmentLabel(value: unknown): string {
  const raw = text(value)
  const normalized = normalizeDepartmentLabel(raw)
  if (normalized === 'logistica') return 'Logística'
  if (normalized === 'deco' || normalized === 'decoracio' || normalized === 'decoracions') {
    return 'Decoracions'
  }
  return raw || 'Sense departament'
}

function buildPreparerDepartments(users: QueryDocumentSnapshot[]): Map<string, string> {
  const departments = new Map<string, string>()
  users.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>
    const department = departmentLabel(data.department || data.departmentLower)
    const keys = [doc.id, data.authId, data.name, ...(Array.isArray(data.aliases) ? data.aliases : [])]
    keys.forEach((value) => {
      const key = text(value).toLocaleLowerCase('ca')
      if (key) departments.set(key, department)
    })
  })
  return departments
}

async function loadRange(db: Firestore, collection: string, dateFrom: string, dateTo: string) {
  return db
    .collection(collection)
    .where('PreparacioData', '>=', dateFrom)
    .where('PreparacioData', '<=', dateTo)
    .get()
}

async function loadParents(db: Firestore, docs: QueryDocumentSnapshot[]) {
  const ids = Array.from(
    new Set(docs.map((doc) => text((doc.data() as RawPreparation).ParentEventId)).filter(Boolean))
  )
  const parents = new Map<string, RawPreparation>()
  for (let offset = 0; offset < ids.length; offset += 250) {
    const chunk = ids.slice(offset, offset + 250)
    const snapshots = await db.getAll(...chunk.map((id) => db.collection('stage_verd').doc(id)))
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) parents.set(snapshot.id, snapshot.data() as RawPreparation)
    })
  }
  return parents
}

function buildDetailRows(
  docs: Array<{ id: string; collection: string; data: RawPreparation }>,
  parents: Map<string, RawPreparation>,
  preparerDepartments: Map<string, string>
): PreparationReportDetail[] {
  const rows: PreparationReportDetail[] = []

  docs.forEach(({ id, collection, data }) => {
    const preparationDate = text(data.PreparacioData)
    const preparationTime = text(data.PreparacioHora).slice(0, 5)
    const startedAt = madridWallClockToEpoch(preparationDate, preparationTime)
    if (startedAt == null) return

    const parent = parents.get(text(data.ParentEventId))
    const completionMap =
      data.PreparacioMagatzems && typeof data.PreparacioMagatzems === 'object'
        ? (data.PreparacioMagatzems as Record<string, Record<string, unknown>>)
        : {}
    const byPreparer = new Map<
      string,
      { id: string; name: string; completedAt: number; warehouses: Set<string> }
    >()

    Object.entries(completionMap).forEach(([warehouseCode, completion]) => {
      const completedAt = timestampMillis(completion?.at)
      if (completedAt == null || completedAt < startedAt) return
      const preparerId = text(completion?.userId)
      const preparerName = firstText(completion?.userName, preparerId, 'Sense identificar')
      const preparerKey = preparerId || preparerName.toLocaleLowerCase('ca')
      const warehouseLabel =
        PREPARATION_WAREHOUSE_LABELS[warehouseCode as PreparationWarehouseCode] || warehouseCode
      const current = byPreparer.get(preparerKey)
      if (!current) {
        byPreparer.set(preparerKey, {
          id: preparerId,
          name: preparerName,
          completedAt,
          warehouses: new Set([warehouseLabel]),
        })
        return
      }
      current.completedAt = Math.max(current.completedAt, completedAt)
      current.warehouses.add(warehouseLabel)
    })

    byPreparer.forEach((completion, preparerKey) => {
      const durationMinutes = Math.round((completion.completedAt - startedAt) / 60_000)
      rows.push({
        id: `${collection}:${id}:${preparerKey}`,
        department:
          preparerDepartments.get(completion.id.toLocaleLowerCase('ca')) ||
          preparerDepartments.get(completion.name.toLocaleLowerCase('ca')) ||
          'Sense departament',
        preparerId: completion.id,
        preparerName: completion.name,
        businessLine: businessLine(data, parent),
        warehouseLabels: Array.from(completion.warehouses).sort((a, b) => a.localeCompare(b, 'ca')),
        eventCode: eventCode(data),
        eventName: eventName(data, parent),
        serviceName: firstText(data.ServiceName, data.Servei),
        preparationDate,
        preparationTime,
        completedAt: completion.completedAt,
        durationMinutes,
      })
    })
  })

  return rows.sort(
    (a, b) =>
      a.preparationDate.localeCompare(b.preparationDate) ||
      a.preparationTime.localeCompare(b.preparationTime) ||
      a.preparerName.localeCompare(b.preparerName, 'ca')
  )
}

function summarize(details: PreparationReportDetail[]): PreparationReportSummary[] {
  const groups = new Map<string, PreparationReportSummary>()
  details.forEach((row) => {
    const preparerKey = row.preparerId || row.preparerName.toLocaleLowerCase('ca')
    const key = `${preparerKey}\u0000${row.businessLine}`
    const current = groups.get(key) || {
      preparerId: row.preparerId,
      preparerName: row.preparerName,
      businessLine: row.businessLine,
      preparationCount: 0,
      totalMinutes: 0,
      totalHours: 0,
    }
    current.preparationCount += 1
    current.totalMinutes += row.durationMinutes
    current.totalHours = round2(current.totalMinutes / 60)
    groups.set(key, current)
  })
  return Array.from(groups.values()).sort(
    (a, b) =>
      a.preparerName.localeCompare(b.preparerName, 'ca') ||
      b.totalMinutes - a.totalMinutes ||
      a.businessLine.localeCompare(b.businessLine, 'ca')
  )
}

function summarizeBusinessLines(
  details: PreparationReportDetail[],
  totalMinutes: number
): PreparationBusinessLineSummary[] {
  const groups = new Map<string, PreparationBusinessLineSummary>()
  details.forEach((row) => {
    const current = groups.get(row.businessLine) || {
      businessLine: row.businessLine,
      preparationCount: 0,
      totalMinutes: 0,
      totalHours: 0,
      sharePct: 0,
    }
    current.preparationCount += 1
    current.totalMinutes += row.durationMinutes
    current.totalHours = round2(current.totalMinutes / 60)
    groups.set(row.businessLine, current)
  })
  return Array.from(groups.values())
    .map((row) => ({
      ...row,
      sharePct: totalMinutes ? round2((row.totalMinutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.businessLine.localeCompare(b.businessLine, 'ca'))
}

export async function buildPreparationsOverview(params: {
  db: Firestore
  dateFrom: string
  dateTo: string
  department?: string
  preparer?: string
  businessLine?: string
}): Promise<PreparationsOverview> {
  const [eventsSnap, servicesSnap, usersSnap] = await Promise.all([
    loadRange(params.db, 'stage_verd', params.dateFrom, params.dateTo),
    loadRange(params.db, 'logistics_preparation_services', params.dateFrom, params.dateTo),
    params.db.collection('users').get(),
  ])
  const serviceDocs = servicesSnap.docs
  const parents = await loadParents(params.db, serviceDocs)
  const eventCodesWithServices = new Set(
    serviceDocs
      .filter((doc) => text((doc.data() as RawPreparation).planningMode) !== 'day')
      .map((doc) => eventCode(doc.data() as RawPreparation))
      .filter(Boolean)
  )
  const allDetails = buildDetailRows(
    [
      ...eventsSnap.docs
        .filter((doc) => !eventCodesWithServices.has(eventCode(doc.data() as RawPreparation)))
        .map((doc) => ({ id: doc.id, collection: 'stage_verd', data: doc.data() as RawPreparation })),
      ...serviceDocs.map((doc) => ({ id: doc.id, collection: 'logistics_preparation_services', data: doc.data() as RawPreparation })),
    ],
    parents,
    buildPreparerDepartments(usersSnap.docs)
  )
  const departmentFilter = normalizeDepartmentLabel(params.department)
  const departmentScopedDetails = allDetails.filter(
    (row) => !departmentFilter || normalizeDepartmentLabel(row.department) === departmentFilter
  )
  const preparerFilter = text(params.preparer).toLocaleLowerCase('ca')
  const businessLineFilter = text(params.businessLine).toLocaleLowerCase('ca')
  const details = departmentScopedDetails.filter((row) => {
    if (preparerFilter) {
      const key = (row.preparerId || row.preparerName).toLocaleLowerCase('ca')
      if (key !== preparerFilter) return false
    }
    return !businessLineFilter || row.businessLine.toLocaleLowerCase('ca') === businessLineFilter
  })
  const totalMinutes = details.reduce((total, row) => total + row.durationMinutes, 0)
  const preparers = new Map<string, string>()
  departmentScopedDetails.forEach((row) => preparers.set(row.preparerId || row.preparerName, row.preparerName))

  return {
    period: { dateFrom: params.dateFrom, dateTo: params.dateTo },
    department: params.department ? departmentLabel(params.department) : 'Tots',
    kpis: {
      totalMinutes,
      totalHours: round2(totalMinutes / 60),
      preparationCount: details.length,
      preparerCount: new Set(details.map((row) => row.preparerId || row.preparerName)).size,
      averageMinutes: details.length ? Math.round(totalMinutes / details.length) : 0,
    },
    summary: summarize(details),
    byBusinessLine: summarizeBusinessLines(details, totalMinutes),
    details,
    filterOptions: {
      departments: Array.from(new Set(allDetails.map((row) => row.department))).sort((a, b) => a.localeCompare(b, 'ca')),
      preparers: Array.from(preparers, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ca')),
      businessLines: Array.from(new Set(departmentScopedDetails.map((row) => row.businessLine))).sort((a, b) => a.localeCompare(b, 'ca')),
    },
  }
}
