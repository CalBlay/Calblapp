import type { Firestore } from 'firebase-admin/firestore'
import { queryQuadrantCollectionDocsInDateRange } from '@/lib/firestoreQuadrantsRangeQuery'
import type {
  EventsWorkersDepartmentRow,
  EventsWorkersEntryRow,
  EventsWorkersInsight,
  EventsWorkersFilterOptions,
  EventsWorkersOverview,
  EventsWorkersReportContext,
  EventsWorkersTrendPoint,
  EventsWorkersWorkerRow,
} from './eventsWorkersOverview'

type BuildWindow =
  | {
      mode: 'rolling'
      days: number
    }
  | {
      mode: 'range'
      dateFrom: string
      dateTo: string
    }

type BuildFilters = {
  department?: string
  workerName?: string
  role?: string
  onlyClosed?: boolean
}

type BuildParams = {
  db: Firestore
  window: BuildWindow
  filters?: BuildFilters
}

type QuadrantPersonLine = {
  id?: string
  name?: string
  meetingPoint?: string
  time?: string
  hour?: string
  startTime?: string
  endTime?: string
  endTimeReal?: string
  sortidaNotes?: string
  noShow?: boolean
  leftEarly?: boolean
}

type QuadrantDoc = {
  eventId?: string
  code?: string
  eventCode?: string
  eventName?: string
  name?: string
  location?: string
  finca?: string
  department?: string
  startDate?: string
  endDate?: string
  phaseDate?: string
  startTime?: string
  endTime?: string
  hour?: string
  convocatoria?: string
  responsable?: QuadrantPersonLine | null
  responsableName?: string
  responsables?: QuadrantPersonLine[]
  conductors?: QuadrantPersonLine[]
  treballadors?: QuadrantPersonLine[]
  workers?: QuadrantPersonLine[]
}

type PersonnelDoc = {
  name?: string
  department?: string
  departmentLower?: string
  maxHoursWeek?: number
}

type WorkerAggregate = {
  workerName: string
  department: string
  roles: Set<string>
  servicesCount: number
  eventIds: Set<string>
  responsibleEventIds: Set<string>
  plannedHours: number
  actualHours: number
  noShowCount: number
  leftEarlyCount: number
  contractedWeeklyHours: number
}

type DepartmentAggregate = {
  department: string
  workerKeys: Set<string>
  servicesCount: number
  responsibleEventsCount: number
  plannedHours: number
  actualHours: number
  contractedRangeHours: number
  overtimeHours: number
  noShowCount: number
  leftEarlyCount: number
}

const QUADRANT_COLLECTIONS = [
  'quadrantsServeis',
  'quadrantsLogistica',
  'quadrantsCuina',
  'quadrantsProduccio',
  'quadrantsComercial',
] as const

const DAY_MS = 86_400_000

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const norm = (s?: string | null) => unaccent(String(s || '')).trim().toLowerCase()

const toYmd = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildContext(window: BuildWindow): EventsWorkersReportContext {
  if (window.mode === 'range') {
    return { kind: 'range', dateFrom: window.dateFrom, dateTo: window.dateTo }
  }
  return { kind: 'rolling', days: window.days }
}

function resolveWindow(window: BuildWindow) {
  if (window.mode === 'range') {
    return {
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
    }
  }

  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - Math.max(1, window.days) + 1)
  return {
    dateFrom: toYmd(start),
    dateTo: toYmd(end),
  }
}

function parseTimeToMinutes(raw?: string | null) {
  const value = String(raw || '').trim()
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function diffHours(startTime?: string | null, endTime?: string | null) {
  const start = parseTimeToMinutes(startTime)
  const end = parseTimeToMinutes(endTime)
  if (start == null || end == null) return 0
  const adjustedEnd = end >= start ? end : end + 24 * 60
  return Math.max(0, adjustedEnd - start) / 60
}

function formatHours(value: number) {
  return `${value.toFixed(1)} h`
}

function weekBucketLabel(dateYmd: string) {
  const date = new Date(`${dateYmd}T00:00:00`)
  if (!Number.isFinite(date.getTime())) return dateYmd
  return toYmd(date)
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function pickRoleList(roleSet: Set<string>) {
  return Array.from(roleSet)
    .filter(Boolean)
    .sort()
    .map((role) => titleCase(role))
    .join(', ')
}

function matchesFilters(entry: EventsWorkersEntryRow, filters?: BuildFilters) {
  if (!filters) return true
  if (filters.department && norm(entry.department) !== norm(filters.department)) return false
  if (filters.workerName && norm(entry.workerName) !== norm(filters.workerName)) return false
  if (filters.role && norm(entry.role) !== norm(filters.role)) return false
  if (filters.onlyClosed && !entry.realEndTime) return false
  return true
}

function uniquePushOption(
  map: Map<string, { value: string; label: string }>,
  value: string,
  label: string
) {
  const key = norm(value)
  if (!key) return
  if (!map.has(key)) map.set(key, { value, label })
}

function collectPersonLines(doc: QuadrantDoc) {
  const lines: Array<{
    name: string
    role: string
    isResponsible: boolean
    department: string
    plannedStartTime: string
    plannedEndTime: string
    realEndTime: string
    noShow: boolean
    leftEarly: boolean
    notes: string
  }> = []

  const department = String(doc.department || '').trim()
  const docStart = String(doc.startTime || doc.hour || doc.convocatoria || '').trim()
  const docEnd = String(doc.endTime || '').trim()

  const push = (person: QuadrantPersonLine | null | undefined, role: string, isResponsible = false) => {
    if (!person) return
    const name = String(person.name || '').trim()
    if (!name) return
    lines.push({
      name,
      role,
      isResponsible,
      department,
      plannedStartTime: String(person.startTime || person.time || person.hour || docStart || '').trim(),
      plannedEndTime: String(person.endTime || docEnd || '').trim(),
      realEndTime: String(person.endTimeReal || '').trim(),
      noShow: person.noShow === true,
      leftEarly: person.leftEarly === true,
      notes: String(person.sortidaNotes || '').trim(),
    })
  }

  push(doc.responsable, 'responsable', true)

  if (!doc.responsable && doc.responsableName) {
    push(
      {
        name: doc.responsableName,
        startTime: docStart,
        endTime: docEnd,
      },
      'responsable',
      true
    )
  }

  ;(Array.isArray(doc.responsables) ? doc.responsables : []).forEach((line) =>
    push(line, 'responsable', true)
  )
  ;(Array.isArray(doc.conductors) ? doc.conductors : []).forEach((line) =>
    push(line, 'conductor')
  )
  ;(Array.isArray(doc.treballadors) ? doc.treballadors : []).forEach((line) =>
    push(line, 'treballador')
  )
  ;(Array.isArray(doc.workers) ? doc.workers : []).forEach((line) => push(line, 'treballador'))

  return lines
}

async function loadPersonnelHours(db: Firestore) {
  const snap = await db.collection('personnel').get()
  const byName = new Map<string, { maxHoursWeek: number; department: string }>()

  snap.forEach((doc) => {
    const data = doc.data() as PersonnelDoc
    const name = String(data.name || doc.id || '').trim()
    if (!name) return
    byName.set(norm(name), {
      maxHoursWeek:
        typeof data.maxHoursWeek === 'number' && Number.isFinite(data.maxHoursWeek)
          ? data.maxHoursWeek
          : 40,
      department: String(data.department || data.departmentLower || '').trim(),
    })
  })

  return byName
}

export async function buildEventsWorkersOverview({
  db,
  window,
  filters,
}: BuildParams): Promise<EventsWorkersOverview> {
  const { dateFrom, dateTo } = resolveWindow(window)
  const [personnelByName, collectionDocs] = await Promise.all([
    loadPersonnelHours(db),
    Promise.all(
      QUADRANT_COLLECTIONS.map(async (collectionId) => {
        const result = await queryQuadrantCollectionDocsInDateRange(
          db.collection(collectionId),
          dateFrom,
          dateTo
        )
        return result.docs.map((doc) => doc.data() as QuadrantDoc)
      })
    ),
  ])

  const allDocs = collectionDocs.flat()
  const filterDepartments = new Map<string, { value: string; label: string }>()
  const filterWorkers = new Map<string, { value: string; label: string }>()
  const entries: EventsWorkersEntryRow[] = []

  allDocs.forEach((doc) => {
    const eventDate = String(doc.phaseDate || doc.startDate || '').slice(0, 10)
    if (!eventDate || eventDate < dateFrom || eventDate > dateTo) return

    const eventId = String(doc.eventId || doc.code || doc.eventCode || '').trim()
    const eventCode = String(doc.code || doc.eventCode || eventId).trim()
    const eventName = String(doc.eventName || doc.name || eventCode || 'Esdeveniment').trim()
    const location = String(doc.location || doc.finca || '').trim()

    collectPersonLines(doc).forEach((line) => {
      const plannedHours = diffHours(line.plannedStartTime, line.plannedEndTime)
      const actualHours = line.noShow
        ? 0
        : diffHours(line.plannedStartTime, line.realEndTime || line.plannedEndTime)

      const entry: EventsWorkersEntryRow = {
        eventId,
        eventCode,
        eventName,
        eventDate,
        department: line.department,
        location,
        workerName: line.name,
        role: line.role,
        isResponsible: line.isResponsible,
        plannedStartTime: line.plannedStartTime,
        plannedEndTime: line.plannedEndTime,
        realEndTime: line.realEndTime,
        plannedHours,
        actualHours,
        noShow: line.noShow,
        leftEarly: line.leftEarly,
        notes: line.notes,
      }

      uniquePushOption(filterDepartments, entry.department, titleCase(entry.department))
      uniquePushOption(filterWorkers, entry.workerName, entry.workerName)

      if (matchesFilters(entry, filters)) {
        entries.push(entry)
      }
    })
  })

  entries.sort((a, b) => {
    if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate)
    if (a.workerName !== b.workerName) return a.workerName.localeCompare(b.workerName, 'ca')
    return a.role.localeCompare(b.role, 'ca')
  })

  const rangeDays =
    Math.max(
      1,
      Math.round(
        (new Date(`${dateTo}T00:00:00`).getTime() - new Date(`${dateFrom}T00:00:00`).getTime()) /
          DAY_MS
      ) + 1
    ) || 1

  const workerMap = new Map<string, WorkerAggregate>()
  const departmentMap = new Map<string, DepartmentAggregate>()
  const trendMap = new Map<string, EventsWorkersTrendPoint>()
  entries.forEach((entry) => {
    const workerKey = `${norm(entry.workerName)}|${norm(entry.department)}`
    const personnel = personnelByName.get(norm(entry.workerName))
    const aggregate =
      workerMap.get(workerKey) ??
      {
        workerName: entry.workerName,
        department: entry.department || personnel?.department || '',
        roles: new Set<string>(),
        servicesCount: 0,
        eventIds: new Set<string>(),
        responsibleEventIds: new Set<string>(),
        plannedHours: 0,
        actualHours: 0,
        noShowCount: 0,
        leftEarlyCount: 0,
        contractedWeeklyHours: personnel?.maxHoursWeek ?? 40,
      }

    aggregate.roles.add(entry.role)
    aggregate.servicesCount += 1
    if (entry.eventId) aggregate.eventIds.add(entry.eventId)
    if (entry.isResponsible && entry.eventId) aggregate.responsibleEventIds.add(entry.eventId)
    aggregate.plannedHours += entry.plannedHours
    aggregate.actualHours += entry.actualHours
    if (entry.noShow) aggregate.noShowCount += 1
    if (entry.leftEarly) aggregate.leftEarlyCount += 1
    workerMap.set(workerKey, aggregate)

    const deptKey = norm(entry.department) || 'sense-departament'
    const departmentAggregate =
      departmentMap.get(deptKey) ??
      {
        department: entry.department || 'Sense departament',
        workerKeys: new Set<string>(),
        servicesCount: 0,
        responsibleEventsCount: 0,
        plannedHours: 0,
        actualHours: 0,
        contractedRangeHours: 0,
        overtimeHours: 0,
        noShowCount: 0,
        leftEarlyCount: 0,
      }
    departmentAggregate.workerKeys.add(workerKey)
    departmentAggregate.servicesCount += 1
    departmentAggregate.plannedHours += entry.plannedHours
    departmentAggregate.actualHours += entry.actualHours
    if (entry.isResponsible) departmentAggregate.responsibleEventsCount += 1
    if (entry.noShow) departmentAggregate.noShowCount += 1
    if (entry.leftEarly) departmentAggregate.leftEarlyCount += 1
    departmentMap.set(deptKey, departmentAggregate)

    const trendKey = weekBucketLabel(entry.eventDate)
    const trendPoint =
      trendMap.get(trendKey) ??
      {
        label: trendKey,
        plannedHours: 0,
        actualHours: 0,
        overtimeHours: 0,
        noShowCount: 0,
      }
    trendPoint.plannedHours += entry.plannedHours
    trendPoint.actualHours += entry.actualHours
    if (entry.noShow) trendPoint.noShowCount += 1
    trendMap.set(trendKey, trendPoint)
  })

  const workers: EventsWorkersWorkerRow[] = Array.from(workerMap.values())
    .map((aggregate) => {
      const contractedRangeHours = (aggregate.contractedWeeklyHours * rangeDays) / 7
      const deviationHours = aggregate.actualHours - contractedRangeHours
      return {
        workerName: aggregate.workerName,
        department: aggregate.department,
        roleMix: pickRoleList(aggregate.roles),
        servicesCount: aggregate.servicesCount,
        eventsCount: aggregate.eventIds.size,
        responsibleEventsCount: aggregate.responsibleEventIds.size,
        plannedHours: Number(aggregate.plannedHours.toFixed(2)),
        actualHours: Number(aggregate.actualHours.toFixed(2)),
        contractedWeeklyHours: Number(aggregate.contractedWeeklyHours.toFixed(2)),
        contractedRangeHours: Number(contractedRangeHours.toFixed(2)),
        deviationHours: Number(deviationHours.toFixed(2)),
        overtimeHours: Number(Math.max(0, deviationHours).toFixed(2)),
        noShowCount: aggregate.noShowCount,
        leftEarlyCount: aggregate.leftEarlyCount,
      }
    })
    .sort((a, b) => {
      if (b.actualHours !== a.actualHours) return b.actualHours - a.actualHours
      return a.workerName.localeCompare(b.workerName, 'ca')
    })

  workers.forEach((worker) => {
    const deptKey = norm(worker.department) || 'sense-departament'
    const departmentAggregate = departmentMap.get(deptKey)
    if (!departmentAggregate) return
    departmentAggregate.contractedRangeHours += worker.contractedRangeHours
    departmentAggregate.overtimeHours += worker.overtimeHours
  })

  const departments: EventsWorkersDepartmentRow[] = Array.from(departmentMap.values())
    .map((aggregate) => ({
      department: aggregate.department,
      workersCount: aggregate.workerKeys.size,
      servicesCount: aggregate.servicesCount,
      responsibleEventsCount: aggregate.responsibleEventsCount,
      plannedHours: Number(aggregate.plannedHours.toFixed(2)),
      actualHours: Number(aggregate.actualHours.toFixed(2)),
      contractedRangeHours: Number(aggregate.contractedRangeHours.toFixed(2)),
      deviationHours: Number((aggregate.actualHours - aggregate.contractedRangeHours).toFixed(2)),
      overtimeHours: Number(aggregate.overtimeHours.toFixed(2)),
      noShowCount: aggregate.noShowCount,
      leftEarlyCount: aggregate.leftEarlyCount,
    }))
    .sort((a, b) => b.actualHours - a.actualHours)

  const trend: EventsWorkersTrendPoint[] = Array.from(trendMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((point) => ({
      ...point,
      plannedHours: Number(point.plannedHours.toFixed(2)),
      actualHours: Number(point.actualHours.toFixed(2)),
      overtimeHours: Number(Math.max(0, point.actualHours - point.plannedHours).toFixed(2)),
    }))

  const totalActualHours = workers.reduce((sum, row) => sum + row.actualHours, 0)
  const totalPlannedHours = workers.reduce((sum, row) => sum + row.plannedHours, 0)
  const totalContractedRangeHours = workers.reduce((sum, row) => sum + row.contractedRangeHours, 0)
  const totalOvertimeHours = workers.reduce((sum, row) => sum + row.overtimeHours, 0)
  const totalResponsibleEvents = workers.reduce((sum, row) => sum + row.responsibleEventsCount, 0)
  const uniqueEvents = new Set(entries.map((entry) => entry.eventId).filter(Boolean)).size
  const totalNoShows = entries.filter((entry) => entry.noShow).length
  const topOvertimeWorker = workers[0] ?? null
  const highestVarianceDept = [...departments].sort((a, b) => b.overtimeHours - a.overtimeHours)[0] ?? null
  const highestNoShowDept = [...departments].sort((a, b) => b.noShowCount - a.noShowCount)[0] ?? null

  const insights: EventsWorkersInsight[] = []
  if (topOvertimeWorker && topOvertimeWorker.overtimeHours > 0) {
    insights.push({
      title: 'Risc d’hores extres concentrat',
      description: `${topOvertimeWorker.workerName} acumula ${formatHours(topOvertimeWorker.overtimeHours)} d’extres al període.`,
      tone: topOvertimeWorker.overtimeHours >= 8 ? 'critical' : 'attention',
    })
  }
  if (highestVarianceDept && highestVarianceDept.overtimeHours > 0) {
    insights.push({
      title: 'Departament amb més desviació',
      description: `${highestVarianceDept.department} registra ${formatHours(highestVarianceDept.overtimeHours)} d’extres i ${formatHours(highestVarianceDept.deviationHours)} de desviació.`,
      tone: highestVarianceDept.overtimeHours >= 12 ? 'critical' : 'attention',
    })
  }
  if (highestNoShowDept && highestNoShowDept.noShowCount > 0) {
    insights.push({
      title: 'Pressió d’assistència',
      description: `${highestNoShowDept.department} concentra ${highestNoShowDept.noShowCount} no-shows al rang seleccionat.`,
      tone: highestNoShowDept.noShowCount >= 3 ? 'critical' : 'attention',
    })
  }
  if (insights.length === 0) {
    insights.push({
      title: 'Lectura estable',
      description: 'No apareixen desviacions crítiques ni absències destacables al període filtrat.',
      tone: 'positive',
    })
  }

  const filterOptions: EventsWorkersFilterOptions = {
    departments: Array.from(filterDepartments.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'ca')
    ),
    workers: Array.from(filterWorkers.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'ca')
    ),
  }

  return {
    reportContext: buildContext(window),
    kpis: [
      { label: 'Treballadors', value: String(workers.length), hint: 'Amb hores o serveis al període' },
      { label: 'Esdeveniments', value: String(uniqueEvents), hint: 'Esdeveniments amb personal assignat' },
      { label: 'Serveis', value: String(entries.length), hint: 'Registres persona-servei al període' },
      { label: 'Hores reals', value: formatHours(totalActualHours), hint: 'Segons tancament o hora prevista si falta tancament' },
      { label: 'Hores planificades', value: formatHours(totalPlannedHours), hint: 'Calculades amb hora inici i hora final planificada' },
      { label: 'Hores contractades', value: formatHours(totalContractedRangeHours), hint: 'Prorrateig de maxHoursWeek del mòdul Personal' },
      { label: 'Hores extres', value: formatHours(totalOvertimeHours), hint: 'Només desviació positiva sobre contractades' },
      { label: 'Resp. d’esdeveniment', value: String(totalResponsibleEvents), hint: 'Cops que un treballador figura com a responsable' },
      { label: 'No shows', value: String(totalNoShows), hint: 'Persones marcades com a no assistència al tancament' },
    ],
    insights,
    departments,
    trend,
    workers,
    entries,
    filterOptions,
  }
}
