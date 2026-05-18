require('dotenv').config({ path: '.env.local' })

const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  })
}

const db = admin.firestore()

const DAY_COUNT = 6
const AUTO_PLAN_DEFAULT_MINUTES = 60
const AUTO_PLAN_START_MINUTES = 8 * 60
const AUTO_PLAN_END_MINUTES = 17 * 60
const AUTO_PLAN_SLOT_STEP = 30
const AUTO_PLAN_MAX_UNASSIGNED = 2

function parseArgs(argv) {
  const out = {
    mode: 'report',
    from: '',
    to: '',
    execute: false,
  }

  const [mode = 'report', ...rest] = argv
  out.mode = mode

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (token === '--from') out.from = rest[i + 1] || ''
    if (token === '--to') out.to = rest[i + 1] || ''
    if (token === '--execute') out.execute = true
  }

  return out
}

function ensureIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${label} ha de tenir format yyyy-MM-dd`)
  }
  return String(value)
}

function parseStoredDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    date.setHours(0, 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
    date.setHours(0, 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeekMonday(date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function calculateNextDue(lastDone, periodicity) {
  if (!periodicity) return null
  const next = new Date(lastDone)
  if (periodicity === 'daily') next.setDate(next.getDate() + 1)
  if (periodicity === 'weekly') next.setDate(next.getDate() + 7)
  if (periodicity === 'monthly') next.setMonth(next.getMonth() + 1)
  if (periodicity === 'quarterly') next.setMonth(next.getMonth() + 3)
  if (periodicity === 'semestral') next.setMonth(next.getMonth() + 6)
  if (periodicity === 'yearly') next.setFullYear(next.getFullYear() + 1)
  next.setHours(23, 59, 59, 999)
  return next
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function minutesFromTime(time) {
  const [hh, mm] = String(time || '00:00')
    .split(':')
    .map(Number)
  return hh * 60 + mm
}

function timeFromMinutes(total) {
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

function getWeekLabel(date) {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const week1 = new Date(target.getFullYear(), 0, 4)
  const dayDiff = (target - week1) / 86400000
  const week = 1 + Math.round((dayDiff - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function pushUniqueWorker(list, value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return
  const wanted = trimmed.toLowerCase()
  if (list.some((current) => current.toLowerCase() === wanted)) return
  list.push(trimmed)
}

function resolveTemplateWorkerPriority(template) {
  const workers = []
  pushUniqueWorker(workers, template.primaryOperator)
  pushUniqueWorker(workers, template.backupOperator)
  return workers
}

function getAutoPlanStartDayIndex(dueDate, weekStart) {
  const date = parseStoredDate(dueDate)
  if (!date) return 0
  const index = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
  return Math.max(0, Math.min(DAY_COUNT - 1, index))
}

function getPlanningDateFromDueDate(dueDate) {
  const planningDate = new Date(dueDate)
  planningDate.setHours(0, 0, 0, 0)
  const day = planningDate.getDay()
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day
  planningDate.setDate(planningDate.getDate() + offset)
  return planningDate
}

function hasWorkerConflict(items, dayIndex, startMin, endMin, workers) {
  if (workers.length === 0) return false
  const wanted = new Set(workers.map(normalizeName))
  return items.some((item) => {
    if (item.dayIndex !== dayIndex) return false
    if (!rangesOverlap(startMin, endMin, minutesFromTime(item.start), minutesFromTime(item.end))) {
      return false
    }
    return item.workers.some((worker) => wanted.has(normalizeName(worker)))
  })
}

function countUnassignedPreventius(items, dayIndex, startMin, endMin) {
  return items.filter((item) => {
    if (item.kind !== 'preventiu') return false
    if (item.dayIndex !== dayIndex) return false
    if (item.workers.length > 0) return false
    return rangesOverlap(startMin, endMin, minutesFromTime(item.start), minutesFromTime(item.end))
  }).length
}

function findAvailablePreventiuSlot(items, options) {
  const comparableItems = options.ignoreId
    ? items.filter((item) => item.id !== options.ignoreId)
    : items

  for (let dayIndex = options.firstDayIndex; dayIndex < DAY_COUNT; dayIndex += 1) {
    for (
      let startMin = AUTO_PLAN_START_MINUTES;
      startMin + options.minutes <= AUTO_PLAN_END_MINUTES;
      startMin += AUTO_PLAN_SLOT_STEP
    ) {
      const endMin = startMin + options.minutes
      if (options.workers.length > 0) {
        if (hasWorkerConflict(comparableItems, dayIndex, startMin, endMin, options.workers)) {
          continue
        }
        return {
          dayIndex,
          start: timeFromMinutes(startMin),
          end: timeFromMinutes(endMin),
          workers: options.workers,
          minutes: options.minutes,
        }
      }

      const overlappingWithoutWorker = countUnassignedPreventius(
        comparableItems,
        dayIndex,
        startMin,
        endMin
      )
      if (overlappingWithoutWorker >= AUTO_PLAN_MAX_UNASSIGNED) continue
      return {
        dayIndex,
        start: timeFromMinutes(startMin),
        end: timeFromMinutes(endMin),
        workers: [],
        minutes: options.minutes,
      }
    }
  }

  return null
}

function findBestPreventiuSlot(items, options) {
  const triedWorkers = []
  const uniqueCandidates = [...options.preferredWorkers, ...(options.fallbackWorkers || [])].filter(
    (worker) => {
      const trimmed = String(worker || '').trim()
      if (!trimmed) return false
      const normalized = normalizeName(trimmed)
      if (!normalized) return false
      if (triedWorkers.some((current) => normalizeName(current) === normalized)) return false
      triedWorkers.push(trimmed)
      return true
    }
  )

  for (const worker of uniqueCandidates) {
    const slot = findAvailablePreventiuSlot(items, {
      minutes: options.minutes,
      workers: [worker],
      firstDayIndex: options.firstDayIndex,
      ignoreId: options.ignoreId,
    })
    if (slot) return slot
  }

  if (options.allowUnassigned === false) return null

  return findAvailablePreventiuSlot(items, {
    minutes: options.minutes,
    workers: [],
    firstDayIndex: options.firstDayIndex,
    ignoreId: options.ignoreId,
  })
}

function findAutoPlanSlot(items, template, weekStart, availableWorkerNames) {
  return findBestPreventiuSlot(items, {
    minutes: AUTO_PLAN_DEFAULT_MINUTES,
    preferredWorkers: resolveTemplateWorkerPriority(template),
    fallbackWorkers: availableWorkerNames || [],
    firstDayIndex: getAutoPlanStartDayIndex(template.dueDate, weekStart),
  })
}

async function loadTemplates() {
  const snap = await db.collection('maintenancePreventiusTemplates').get()
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    autoPlanExcludedWeeks: Array.isArray(doc.get('autoPlanExcludedWeeks'))
      ? doc.get('autoPlanExcludedWeeks').map(String)
      : [],
  }))
}

async function loadMaintenanceWorkers() {
  const snap = await db.collection('personnel').get()
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((user) => normalizeName(user.departmentLower || user.department || '').includes('manten'))
    .map((user) => ({ id: String(user.id || ''), name: String(user.name || '').trim() }))
    .filter((user) => user.id && user.name)
}

async function loadPlannedRange(start, end) {
  const snap = await db
    .collection('maintenancePreventiusPlanned')
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get()
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

async function loadTicketAgendaForWeek(start, end, weekStart) {
  const snap = await db.collection('maintenanceTickets').get()
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((ticket) => !ticket.externalized)
    .filter((ticket) => ticket.plannedStart && ticket.plannedEnd)
    .map((ticket) => {
      const startDate = new Date(Number(ticket.plannedStart))
      const endDate = new Date(Number(ticket.plannedEnd))
      const date = formatDate(startDate)
      if (date < start || date > end) return null
      const dayIndex = Math.round((parseStoredDate(date).getTime() - weekStart.getTime()) / 86400000)
      if (dayIndex < 0 || dayIndex >= DAY_COUNT) return null
      return {
        id: String(ticket.id),
        kind: 'ticket',
        dayIndex,
        start: timeFromMinutes(startDate.getHours() * 60 + startDate.getMinutes()),
        end: timeFromMinutes(endDate.getHours() * 60 + endDate.getMinutes()),
        workers: Array.isArray(ticket.assignedToNames) ? ticket.assignedToNames.map(String) : [],
      }
    })
    .filter(Boolean)
}

function mapCurrentWeekPlanned(plannedList, weekStart) {
  return plannedList
    .map((item) => {
      const date = parseStoredDate(item.date)
      if (!date) return null
      const dayIndex = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
      if (dayIndex < 0 || dayIndex >= DAY_COUNT) return null
      const start = String(item.startTime || '')
      const end = String(item.endTime || '')
      if (!start || !end) return null
      return {
        id: String(item.id),
        kind: 'preventiu',
        title: String(item.title || ''),
        workers: Array.isArray(item.workerNames) ? item.workerNames.map(String) : [],
        dayIndex,
        start,
        end,
        minutes: Math.max(30, minutesFromTime(end) - minutesFromTime(start)),
        priority: String(item.priority || 'normal'),
        location: String(item.location || ''),
        templateId: item.templateId ? String(item.templateId) : null,
        status: String(item.lastStatus || 'assignat'),
      }
    })
    .filter(Boolean)
}

function buildDueTemplatesForWeek(templates, weekStart) {
  const weekEnd = addDays(weekStart, DAY_COUNT - 1)
  weekEnd.setHours(23, 59, 59, 999)
  const weekStartDay = new Date(weekStart)
  weekStartDay.setHours(0, 0, 0, 0)

  return templates
    .map((template) => {
      const lastDone = parseStoredDate(template.lastDone)
      const nextDue = lastDone ? calculateNextDue(lastDone, template.periodicity) : null
      return { template, nextDue }
    })
    .filter(({ nextDue }) => Boolean(nextDue) && nextDue.getTime() <= weekEnd.getTime())
    .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime() || String(a.template.name || '').localeCompare(String(b.template.name || '')))
    .map(({ template, nextDue }) => ({
      ...template,
      dueState: nextDue.getTime() < weekStartDay.getTime() ? 'overdue' : 'due',
      dueDate: formatDate(nextDue),
      planningDate: formatDate(getPlanningDateFromDueDate(nextDue)),
    }))
    .filter((template) => {
      const planningDate = parseStoredDate(template.planningDate)
      return Boolean(planningDate) && planningDate.getTime() <= weekEnd.getTime()
    })
}

function getPlannedTemplateIdsForCurrentCycle(dueTemplates, plannedList) {
  const planningDateByTemplateId = new Map(
    dueTemplates.map((template) => [String(template.id || ''), String(template.planningDate || '')])
  )

  return new Set(
    plannedList
      .map((item) => {
        const templateId = String(item.templateId || '')
        if (!templateId) return ''
        const plannedDate = String(item.date || '')
        const planningDate = planningDateByTemplateId.get(templateId)
        if (!planningDate || !plannedDate) return ''
        return plannedDate >= planningDate ? templateId : ''
      })
      .filter(Boolean)
  )
}

function resolveWorkerIds(names, workers) {
  const map = new Map(workers.map((worker) => [normalizeName(worker.name), worker.id]))
  return names
    .map((name) => map.get(normalizeName(name)))
    .filter(Boolean)
}

async function removeFutureWeekExclusions(templates, weekLabels, execute) {
  const touched = []
  for (const template of templates) {
    const current = Array.isArray(template.autoPlanExcludedWeeks)
      ? template.autoPlanExcludedWeeks.map(String)
      : []
    const next = current.filter((label) => !weekLabels.has(label))
    if (next.length === current.length) continue
    touched.push({
      id: template.id,
      name: String(template.name || ''),
      removedWeeks: current.filter((label) => weekLabels.has(label)),
    })
    if (execute) {
      await db.collection('maintenancePreventiusTemplates').doc(template.id).set(
        {
          autoPlanExcludedWeeks: next,
          updatedAt: Date.now(),
          updatedByName: 'maintenancePreventiusResetScript',
        },
        { merge: true }
      )
    }
  }
  return touched
}

async function deletePlannedDocs(items, execute) {
  if (!execute) return { deleted: 0 }
  let batch = db.batch()
  let ops = 0
  let deleted = 0
  for (const item of items) {
    batch.delete(db.collection('maintenancePreventiusPlanned').doc(item.id))
    ops += 1
    deleted += 1
    if (ops === 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  return { deleted }
}

async function replanRange({ from, to, execute }) {
  const templates = await loadTemplates()
  const workers = await loadMaintenanceWorkers()
  const futurePlanned = await loadPlannedRange(from, to)
  const simulatedCreatedDocs = []
  const weekLabels = new Set()
  for (let cursor = startOfWeekMonday(parseStoredDate(from)); formatDate(cursor) <= to; cursor = addDays(cursor, 7)) {
    weekLabels.add(getWeekLabel(cursor))
  }

  const clearedExclusions = await removeFutureWeekExclusions(templates, weekLabels, execute)
  const deleteResult = await deletePlannedDocs(futurePlanned, execute)
  const created = []

  for (
    let weekStart = startOfWeekMonday(parseStoredDate(from));
    formatDate(weekStart) <= to;
    weekStart = addDays(weekStart, 7)
  ) {
    const weekEnd = formatDate(addDays(weekStart, DAY_COUNT - 1))
    const dueTemplates = buildDueTemplatesForWeek(templates, weekStart)
    if (dueTemplates.length === 0) continue

    const persistedPlannedList = await loadPlannedRange(from, weekEnd)
    const plannedList = execute
      ? persistedPlannedList
      : [
          ...persistedPlannedList.filter((item) => {
            const date = String(item.date || '')
            return date < from || date > to
          }),
          ...simulatedCreatedDocs.filter((item) => item.date >= from && item.date <= weekEnd),
        ]
    const plannedMapped = mapCurrentWeekPlanned(plannedList, weekStart)
    const ticketsMapped = await loadTicketAgendaForWeek(formatDate(weekStart), weekEnd, weekStart)

    const workingPreventius = [...plannedMapped]
    const workingAgenda = [...plannedMapped, ...ticketsMapped]
    const alreadyPlannedTemplateIds = getPlannedTemplateIdsForCurrentCycle(
      dueTemplates,
      plannedList
    )
    const maintenanceWorkerNames = workers.map((worker) => worker.name)
    const weekLabel = getWeekLabel(weekStart)

    for (const template of dueTemplates) {
      if (alreadyPlannedTemplateIds.has(template.id)) continue
      if ((template.autoPlanExcludedWeeks || []).includes(weekLabel)) continue

      const slot = findAutoPlanSlot(workingAgenda, template, weekStart, maintenanceWorkerNames)
      if (!slot) continue

      const dateStr = formatDate(addDays(weekStart, slot.dayIndex))
      const workerNames = slot.workers
      const workerIds = resolveWorkerIds(workerNames, workers)
      const payload = {
        templateId: template.id,
        title: String(template.name || ''),
        date: dateStr,
        startTime: slot.start,
        endTime: slot.end,
        priority: 'normal',
        location: String(template.location || ''),
        workerNames,
        workerIds,
        createdAt: Date.now(),
        createdByName: 'maintenancePreventiusResetScript',
        updatedAt: Date.now(),
        updatedByName: 'maintenancePreventiusResetScript',
      }

      let id = `dry-${template.id}-${dateStr}-${slot.start}`
      if (execute) {
        const doc = await db.collection('maintenancePreventiusPlanned').add(payload)
        id = doc.id
      }

      simulatedCreatedDocs.push({ id, ...payload })

      const scheduledItem = {
        id,
        kind: 'preventiu',
        title: payload.title,
        workers: workerNames,
        dayIndex: slot.dayIndex,
        start: slot.start,
        end: slot.end,
        minutes: slot.minutes,
        priority: 'normal',
        location: payload.location,
        templateId: template.id,
      }
      workingPreventius.push(scheduledItem)
      workingAgenda.push(scheduledItem)
      alreadyPlannedTemplateIds.add(template.id)
      created.push({
        id,
        templateId: template.id,
        title: payload.title,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        workerNames: payload.workerNames,
      })
    }
  }

  return {
    futurePlannedCount: futurePlanned.length,
    deleted: deleteResult.deleted,
    clearedExclusions,
    created,
  }
}

async function reportRange(from, to) {
  const [templates, futurePlanned] = await Promise.all([loadTemplates(), loadPlannedRange(from, to)])
  const byDate = new Map()
  for (const item of futurePlanned) {
    const date = String(item.date || '')
    byDate.set(date, (byDate.get(date) || 0) + 1)
  }

  const weekLabels = []
  for (
    let weekStart = startOfWeekMonday(parseStoredDate(from));
    formatDate(weekStart) <= to;
    weekStart = addDays(weekStart, 7)
  ) {
    weekLabels.push(getWeekLabel(weekStart))
  }

  const exclusionsInRange = templates
    .map((template) => ({
      id: template.id,
      name: String(template.name || ''),
      weeks: (Array.isArray(template.autoPlanExcludedWeeks) ? template.autoPlanExcludedWeeks : []).filter(
        (label) => weekLabels.includes(label)
      ),
    }))
    .filter((template) => template.weeks.length > 0)

  return {
    from,
    to,
    totalPlanned: futurePlanned.length,
    byDate: Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    uniqueTemplates: new Set(futurePlanned.map((item) => String(item.templateId || '')).filter(Boolean)).size,
    exclusionsInRange,
    sample: futurePlanned.slice(0, 20).map((item) => ({
      id: item.id,
      date: item.date,
      title: item.title,
      templateId: item.templateId,
      startTime: item.startTime,
      endTime: item.endTime,
      workerNames: item.workerNames || [],
    })),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const from = ensureIsoDate(args.from || '2026-05-25', '--from')

  const futureFrom = await loadPlannedRange(from, '9999-12-31')
  const inferredTo = futureFrom
    .map((item) => String(item.date || ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .slice(-1)[0]
  const to = ensureIsoDate(args.to || inferredTo || from, '--to')

  if (args.mode === 'report') {
    console.log(JSON.stringify(await reportRange(from, to), null, 2))
    return
  }

  if (args.mode === 'reset-and-replan') {
    const result = await replanRange({ from, to, execute: args.execute })
    console.log(
      JSON.stringify(
        {
          from,
          to,
          execute: args.execute,
          futurePlannedCount: result.futurePlannedCount,
          deleted: result.deleted,
          clearedExclusions: result.clearedExclusions,
          createdCount: result.created.length,
          createdSample: result.created.slice(0, 50),
        },
        null,
        2
      )
    )
    return
  }

  throw new Error(`Mode no suportat: ${args.mode}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
