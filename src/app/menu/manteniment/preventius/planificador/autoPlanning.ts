'use client'

import type { DueTemplate, ScheduledItem, Template } from './types'

export const AUTO_PLAN_DEFAULT_MINUTES = 60
export const AUTO_PLAN_START_MINUTES = 8 * 60
export const AUTO_PLAN_END_MINUTES = 17 * 60
export const AUTO_PLAN_SLOT_STEP = 30
export const AUTO_PLAN_MAX_UNASSIGNED = 2

export const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && endA > startB

const pushUniqueWorker = (
  list: string[],
  value: string,
  normalizeName: (worker: string) => string
) => {
  const trimmed = value.trim()
  if (!trimmed) return
  const wanted = normalizeName(trimmed)
  if (!wanted) return
  if (list.some((current) => normalizeName(current) === wanted)) return
  list.push(trimmed)
}

export const resolveTemplateWorkerPriority = (template: Template) => {
  const workers: string[] = []
  pushUniqueWorker(workers, String(template.primaryOperator || ''), (worker) => worker.toLowerCase())
  pushUniqueWorker(workers, String(template.backupOperator || ''), (worker) => worker.toLowerCase())
  return workers
}

export const resolveTemplateWorkerNames = (template: Template) => {
  const [firstWorker] = resolveTemplateWorkerPriority(template)
  return firstWorker ? [firstWorker] : []
}

export const getAutoPlanStartDayIndex = (
  planningDate: string,
  weekStart: Date,
  dayCount: number,
  parseStoredDate: (value?: string | null) => Date | null
) => {
  const date = parseStoredDate(planningDate)
  if (!date) return 0
  const index = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
  return Math.max(0, Math.min(dayCount - 1, index))
}

export const hasWorkerConflict = (
  items: ScheduledItem[],
  dayIndex: number,
  startMin: number,
  endMin: number,
  workers: string[],
  normalizeName: (value: string) => string,
  minutesFromTime: (time: string) => number
) => {
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

export const countUnassignedPreventius = (
  items: ScheduledItem[],
  dayIndex: number,
  startMin: number,
  endMin: number,
  minutesFromTime: (time: string) => number
) =>
  items.filter((item) => {
    if (item.kind !== 'preventiu') return false
    if (item.dayIndex !== dayIndex) return false
    if (item.workers.length > 0) return false
    return rangesOverlap(startMin, endMin, minutesFromTime(item.start), minutesFromTime(item.end))
  }).length

export const findAvailablePreventiuSlot = (
  items: ScheduledItem[],
  options: {
    minutes: number
    workers: string[]
    firstDayIndex: number
    dayCount: number
    ignoreId?: string
    normalizeName: (value: string) => string
    minutesFromTime: (time: string) => number
    timeFromMinutes: (total: number) => string
  }
) => {
  const {
    minutes,
    workers,
    firstDayIndex,
    dayCount,
    ignoreId,
    normalizeName,
    minutesFromTime,
    timeFromMinutes,
  } = options
  const comparableItems = ignoreId ? items.filter((item) => item.id !== ignoreId) : items

  for (let dayIndex = firstDayIndex; dayIndex < dayCount; dayIndex += 1) {
    for (
      let startMin = AUTO_PLAN_START_MINUTES;
      startMin + minutes <= AUTO_PLAN_END_MINUTES;
      startMin += AUTO_PLAN_SLOT_STEP
    ) {
      const endMin = startMin + minutes
      if (workers.length > 0) {
        if (
          hasWorkerConflict(
            comparableItems,
            dayIndex,
            startMin,
            endMin,
            workers,
            normalizeName,
            minutesFromTime
          )
        ) {
          continue
        }
        return {
          dayIndex,
          start: timeFromMinutes(startMin),
          end: timeFromMinutes(endMin),
          workers,
          minutes,
        }
      }

      const overlappingWithoutWorker = countUnassignedPreventius(
        comparableItems,
        dayIndex,
        startMin,
        endMin,
        minutesFromTime
      )
      if (overlappingWithoutWorker >= AUTO_PLAN_MAX_UNASSIGNED) continue
      return {
        dayIndex,
        start: timeFromMinutes(startMin),
        end: timeFromMinutes(endMin),
        workers: [] as string[],
        minutes,
      }
    }
  }

  return null
}

export const findBestPreventiuSlot = (
  items: ScheduledItem[],
  options: {
    minutes: number
    preferredWorkers: string[]
    fallbackWorkers?: string[]
    firstDayIndex: number
    dayCount: number
    ignoreId?: string
    normalizeName: (value: string) => string
    minutesFromTime: (time: string) => number
    timeFromMinutes: (total: number) => string
    allowUnassigned?: boolean
  }
) => {
  const {
    minutes,
    preferredWorkers,
    fallbackWorkers = [],
    firstDayIndex,
    dayCount,
    ignoreId,
    normalizeName,
    minutesFromTime,
    timeFromMinutes,
    allowUnassigned = true,
  } = options

  const triedWorkers: string[] = []
  const uniqueCandidates = [...preferredWorkers, ...fallbackWorkers].filter((worker) => {
    const trimmed = String(worker || '').trim()
    if (!trimmed) return false
    const normalized = normalizeName(trimmed)
    if (!normalized) return false
    if (triedWorkers.some((current) => normalizeName(current) === normalized)) return false
    triedWorkers.push(trimmed)
    return true
  })

  for (const worker of uniqueCandidates) {
    const slot = findAvailablePreventiuSlot(items, {
      minutes,
      workers: [worker],
      firstDayIndex,
      dayCount,
      ignoreId,
      normalizeName,
      minutesFromTime,
      timeFromMinutes,
    })
    if (slot) return slot
  }

  if (!allowUnassigned) return null

  return findAvailablePreventiuSlot(items, {
    minutes,
    workers: [],
    firstDayIndex,
    dayCount,
    ignoreId,
    normalizeName,
    minutesFromTime,
    timeFromMinutes,
  })
}

export const findAutoPlanSlot = (
  items: ScheduledItem[],
  template: DueTemplate,
  options: {
    weekStart: Date
    dayCount: number
    availableWorkerNames?: string[]
    parseStoredDate: (value?: string | null) => Date | null
    normalizeName: (value: string) => string
    minutesFromTime: (time: string) => number
    timeFromMinutes: (total: number) => string
  }
) =>
  findBestPreventiuSlot(items, {
    minutes: AUTO_PLAN_DEFAULT_MINUTES,
    preferredWorkers: resolveTemplateWorkerPriority(template),
    fallbackWorkers: options.availableWorkerNames || [],
    firstDayIndex: getAutoPlanStartDayIndex(
      template.planningDate,
      options.weekStart,
      options.dayCount,
      options.parseStoredDate
    ),
    dayCount: options.dayCount,
    normalizeName: options.normalizeName,
    minutesFromTime: options.minutesFromTime,
    timeFromMinutes: options.timeFromMinutes,
  })
