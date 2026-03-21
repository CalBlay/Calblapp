'use client'

import type { DueTemplate, ScheduledItem, Template } from './types'

export const AUTO_PLAN_DAY_COUNT = 5
export const AUTO_PLAN_DEFAULT_MINUTES = 60
export const AUTO_PLAN_START_MINUTES = 9 * 60
export const AUTO_PLAN_END_MINUTES = 17 * 60
export const AUTO_PLAN_SLOT_STEP = 30
export const AUTO_PLAN_MAX_UNASSIGNED = 2

export const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && endA > startB

export const resolveTemplateWorkerNames = (template: Template) => {
  const primary = (template.primaryOperator || '').trim()
  if (primary) return [primary]
  const backup = (template.backupOperator || '').trim()
  if (backup) return [backup]
  return []
}

export const getAutoPlanStartDayIndex = (
  dueDate: string,
  weekStart: Date,
  parseStoredDate: (value?: string | null) => Date | null
) => {
  const date = parseStoredDate(dueDate)
  if (!date) return 0
  const index = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
  return Math.max(0, Math.min(AUTO_PLAN_DAY_COUNT - 1, index))
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
    ignoreId,
    normalizeName,
    minutesFromTime,
    timeFromMinutes,
  } = options
  const comparableItems = ignoreId ? items.filter((item) => item.id !== ignoreId) : items

  for (let dayIndex = firstDayIndex; dayIndex < AUTO_PLAN_DAY_COUNT; dayIndex += 1) {
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

export const findAutoPlanSlot = (
  items: ScheduledItem[],
  template: DueTemplate,
  options: {
    weekStart: Date
    parseStoredDate: (value?: string | null) => Date | null
    normalizeName: (value: string) => string
    minutesFromTime: (time: string) => number
    timeFromMinutes: (total: number) => string
  }
) =>
  findAvailablePreventiuSlot(items, {
    minutes: AUTO_PLAN_DEFAULT_MINUTES,
    workers: resolveTemplateWorkerNames(template),
    firstDayIndex: getAutoPlanStartDayIndex(template.dueDate, options.weekStart, options.parseStoredDate),
    normalizeName: options.normalizeName,
    minutesFromTime: options.minutesFromTime,
    timeFromMinutes: options.timeFromMinutes,
  })
