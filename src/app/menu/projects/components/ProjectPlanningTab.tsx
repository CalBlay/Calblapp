'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, Layers3, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { colorByDepartment } from '@/lib/colors'
import { cn } from '@/lib/utils'
import {
  formatProjectDate,
  getBlockDepartments,
  type ProjectBlock,
  type ProjectData,
  type ProjectTask,
} from './project-shared'
import { projectEmptyStateClass, projectModuleShellClass } from './project-ui'

type Props = {
  projectId: string
  project: ProjectData
  canConvokeMeetings?: boolean
  meetingActaUser?: unknown
  onOpenMeetingMinutes?: () => void
  onOpenBlockMeeting?: (blockId: string) => void
  onOpenTaskMeeting?: (blockId: string, taskId: string) => void
  onNavigateToBlock?: (blockId: string) => void
  onNavigateToTask?: (blockId: string, taskId: string) => void
}

type LaneKind = 'block' | 'task'
type TimeScale = 'day' | 'week'

type PlanningItem = {
  id: string
  kind: LaneKind
  title: string
  subtitle?: string
  department?: string
  owner?: string
  status?: string
  start: Date
  end: Date
  blockId: string
  taskId?: string
}

type TimelineColumn = {
  key: string
  start: Date
  end: Date
  label: string
  monthLabel: string
}

type TimelineRenderItem = PlanningItem & {
  startColumn: number
  endColumn: number
  daysLeft: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const LABEL_COLUMN_WIDTH = 300
const DAY_COLUMN_WIDTH = 74
const WEEK_COLUMN_WIDTH = 132
const ROW_HEIGHT = 72

const parseDate = (value?: string | number | null) => {
  if (typeof value === 'number' && value > 0) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toStartOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate())

const addDays = (value: Date, amount: number) => {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  next.setHours(0, 0, 0, 0)
  return next
}

const diffDays = (from: Date, to: Date) =>
  Math.round((toStartOfDay(to).getTime() - toStartOfDay(from).getTime()) / DAY_MS)

const shortDate = (value?: Date | null) =>
  value
    ? value.toLocaleDateString('ca-ES', {
        day: '2-digit',
        month: '2-digit',
      })
    : '--'

const rangeLabel = (start: Date, end: Date) => `${shortDate(start)} - ${shortDate(end)}`

const monthBandLabel = (value: Date) =>
  value.toLocaleDateString('ca-ES', {
    month: '2-digit',
    year: 'numeric',
  })

const countdownTone = (daysLeft: number) => {
  if (daysLeft < 0) return 'bg-rose-100 text-rose-700'
  if (daysLeft <= 3) return 'bg-amber-100 text-amber-800'
  return 'bg-emerald-100 text-emerald-700'
}

const countdownLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `Retard ${Math.abs(daysLeft)} dies`
  if (daysLeft === 0) return 'Venc avui'
  if (daysLeft === 1) return 'Falta 1 dia'
  return `Falten ${daysLeft} dies`
}

const laneBarTone = (kind: LaneKind, status?: string) => {
  if (kind === 'block') {
    if (status === 'done') return 'bg-sky-100 text-sky-900 ring-sky-200'
    if (status === 'blocked') return 'bg-rose-100 text-rose-900 ring-rose-200'
    if (status === 'in_progress') return 'bg-cyan-100 text-cyan-900 ring-cyan-200'
    if (status === 'overdue') return 'bg-amber-100 text-amber-900 ring-amber-200'
    return 'bg-slate-100 text-slate-800 ring-slate-200'
  }
  if (status === 'done') return 'bg-emerald-100 text-emerald-900 ring-emerald-200'
  if (status === 'blocked') return 'bg-rose-100 text-rose-900 ring-rose-200'
  if (status === 'in_progress') return 'bg-cyan-100 text-cyan-900 ring-cyan-200'
  if (status === 'overdue') return 'bg-amber-100 text-amber-900 ring-amber-200'
  return 'bg-slate-100 text-slate-800 ring-slate-200'
}

const findColumnIndex = (columns: TimelineColumn[], value: Date) => {
  const point = toStartOfDay(value).getTime()
  const index = columns.findIndex((column) => {
    const start = toStartOfDay(column.start).getTime()
    const end = toStartOfDay(column.end).getTime()
    return point >= start && point <= end
  })
  return index === -1 ? Math.max(0, columns.length - 1) : index
}

const getProjectCreatedDate = (project: ProjectData) => parseDate(project.createdAt)

const buildBlockItem = (
  project: ProjectData,
  projectId: string,
  projectCreatedAt: Date,
  block: ProjectBlock
): PlanningItem => {
  const blockStart = parseDate(block.createdAt) || parseDate(project.startDate) || projectCreatedAt
  const blockEnd = parseDate(block.deadline) || blockStart

  return {
    id: `block-${block.id}`,
    kind: 'block',
    title: block.name || 'Bloc',
    subtitle: block.summary || '',
    department: getBlockDepartments(block)[0] || '',
    owner: block.owner || '',
    status: block.status || 'pending',
    start: blockStart,
    end: blockEnd,
    blockId: block.id,
  }
}

const buildTaskItem = (
  projectCreatedAt: Date,
  block: ProjectBlock,
  task: ProjectTask
): PlanningItem => {
  const blockStart = parseDate(block.createdAt) || projectCreatedAt
  const taskStart = parseDate(task.createdAt) || blockStart
  const taskEnd = parseDate(task.deadline) || taskStart

  return {
    id: `task-${task.id}`,
    kind: 'task',
    title: task.title || 'Tasca',
    subtitle: task.description || '',
    department: task.department || getBlockDepartments(block)[0] || '',
    owner: task.owner || '',
    status: task.status || 'pending',
    start: taskStart,
    end: taskEnd,
    blockId: block.id,
    taskId: task.id,
  }
}

export default function ProjectPlanningTab({
  projectId,
  project,
  onNavigateToBlock,
  onNavigateToTask,
}: Props) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const projectCreatedAt = useMemo(
    () => getProjectCreatedDate(project) || parseDate(project.startDate) || new Date(),
    [project]
  )
  const projectEndAt = useMemo(
    () => parseDate(project.launchDate) || projectCreatedAt,
    [project.launchDate, projectCreatedAt]
  )

  const blockItems = useMemo(
    () => project.blocks.map((block) => buildBlockItem(project, projectId, projectCreatedAt, block)),
    [project, projectCreatedAt, projectId]
  )

  const selectedBlock = useMemo(
    () => project.blocks.find((block) => block.id === selectedBlockId) || null,
    [project.blocks, selectedBlockId]
  )

  const taskItems = useMemo(
    () =>
      selectedBlock
        ? (selectedBlock.tasks || []).map((task) => buildTaskItem(projectCreatedAt, selectedBlock, task))
        : [],
    [projectCreatedAt, selectedBlock]
  )

  const visibleItems = selectedBlock ? taskItems : blockItems

  const rangeStart = useMemo(() => {
    if (selectedBlock) {
      const dates = [
        parseDate(selectedBlock.createdAt),
        ...((selectedBlock.tasks || []).map((task) => parseDate(task.createdAt))),
      ].filter(Boolean) as Date[]
      return dates.length > 0
        ? dates.reduce((earliest, current) => (current < earliest ? current : earliest))
        : parseDate(selectedBlock.createdAt) || projectCreatedAt
    }
    return projectCreatedAt
  }, [projectCreatedAt, selectedBlock])

  const rangeEnd = useMemo(() => {
    if (selectedBlock) {
      const dates = [
        parseDate(selectedBlock.deadline),
        ...((selectedBlock.tasks || []).map((task) => parseDate(task.deadline))),
      ].filter(Boolean) as Date[]
      return dates.length > 0
        ? dates.reduce((latest, current) => (current > latest ? current : latest))
        : parseDate(selectedBlock.deadline) || rangeStart
    }
    return projectEndAt
  }, [projectEndAt, rangeStart, selectedBlock])

  const totalRangeDays = useMemo(
    () => Math.max(1, diffDays(rangeStart, rangeEnd) + 1),
    [rangeEnd, rangeStart]
  )
  const timeScale: TimeScale = totalRangeDays <= 21 ? 'day' : 'week'

  const timeColumns = useMemo(() => {
    const columns: TimelineColumn[] = []
    let cursor = toStartOfDay(rangeStart)

    while (cursor <= rangeEnd) {
      const start = cursor
      const end = timeScale === 'day' ? start : addDays(start, 6)
      const cappedEnd = end > rangeEnd ? rangeEnd : end
      columns.push({
        key: start.toISOString(),
        start,
        end: cappedEnd,
        label: timeScale === 'day' ? shortDate(start) : rangeLabel(start, cappedEnd),
        monthLabel: monthBandLabel(start),
      })
      cursor = addDays(cursor, timeScale === 'day' ? 1 : 7)
    }

    return columns
  }, [rangeEnd, rangeStart, timeScale])

  const monthBands = useMemo(() => {
    const bands: Array<{ key: string; label: string; span: number }> = []
    timeColumns.forEach((column) => {
      const last = bands[bands.length - 1]
      if (last?.label === column.monthLabel) last.span += 1
      else bands.push({ key: `${column.monthLabel}-${column.key}`, label: column.monthLabel, span: 1 })
    })
    return bands
  }, [timeColumns])

  const timelineItems = useMemo<TimelineRenderItem[]>(() => {
    return visibleItems
      .map((item) => {
        const startColumn = findColumnIndex(timeColumns, item.start) + 1
        const endColumn = findColumnIndex(timeColumns, item.end) + 1
        return {
          ...item,
          startColumn,
          endColumn: Math.max(startColumn, endColumn),
          daysLeft: diffDays(new Date(), item.end),
        }
      })
      .sort((left, right) => {
        if (left.start.getTime() !== right.start.getTime()) return left.start.getTime() - right.start.getTime()
        return left.title.localeCompare(right.title)
      })
  }, [timeColumns, visibleItems])

  const timelineColumnWidth = timeScale === 'day' ? DAY_COLUMN_WIDTH : WEEK_COLUMN_WIDTH
  const timelineGridColumns = `${LABEL_COLUMN_WIDTH}px repeat(${timeColumns.length}, minmax(${timelineColumnWidth}px, 1fr))`
  const firstColumnClass = 'sticky left-0 z-20 border-r border-slate-200 bg-white'

  const handleOpenBlockDetail = (blockId: string) => {
    setSelectedBlockId(blockId)
  }

  const handleRowAction = (item: TimelineRenderItem) => {
    if (item.kind === 'block') {
      handleOpenBlockDetail(item.blockId)
      return
    }
    if (item.taskId) onNavigateToTask?.(item.blockId, item.taskId)
  }

  return (
    <div className="space-y-6">
      <section className={cn(projectModuleShellClass, 'p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {selectedBlock ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSelectedBlockId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
                Tornar als blocs
              </Button>
            ) : null}

            <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              {timeScale === 'day' ? 'Vista per dies' : 'Vista per setmanes'}
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              {shortDate(rangeStart)} - {shortDate(rangeEnd)}
            </div>
            {!selectedBlock ? (
              <div className="rounded-full bg-sky-100 px-3 py-2 text-sm font-medium text-sky-800">
                {blockItems.length} blocs
              </div>
            ) : (
              <div className="rounded-full bg-cyan-100 px-3 py-2 text-sm font-medium text-cyan-800">
                {(selectedBlock.tasks || []).length} tasques
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedBlock ? (
              <>
                <div className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                  {selectedBlock.name || 'Bloc'}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onNavigateToBlock?.(selectedBlock.id)}
                >
                  <Layers3 className="h-4 w-4" />
                  Obrir bloc
                </Button>
              </>
            ) : (
              <div className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 lg:inline-flex">
                <Target className="h-4 w-4" />
                Entrega {formatProjectDate(project.launchDate)}
              </div>
            )}
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <div className={`mt-5 rounded-[24px] bg-slate-50 px-6 py-10 ${projectEmptyStateClass}`}>
            {selectedBlock ? 'Aquest bloc encara no te tasques planificades.' : 'Encara no hi ha blocs planificats.'}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-max">
              <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm">
                <div className="grid gap-0" style={{ gridTemplateColumns: timelineGridColumns }}>
                  <div className="sticky left-0 z-40 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {selectedBlock ? 'Tasques del bloc' : 'Blocs'}
                  </div>
                  {monthBands.map((band) => (
                    <div
                      key={band.key}
                      className="border-b border-slate-200 bg-slate-100 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                      style={{ gridColumn: `span ${band.span}` }}
                    >
                      {band.label}
                    </div>
                  ))}

                  <div className="sticky left-0 z-40 border-b border-r border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600">
                    Element
                  </div>
                  {timeColumns.map((column) => (
                    <div
                      key={`column-${column.key}`}
                      className="border-b border-slate-200 bg-white px-2 py-3 text-center text-xs font-medium text-slate-500"
                    >
                      {column.label}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                {timelineItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-0"
                    style={{ gridTemplateColumns: timelineGridColumns }}
                  >
                    <div
                      className={`${firstColumnClass} flex items-start gap-3 border-b border-slate-200 px-4 py-4`}
                      style={{ minHeight: `${ROW_HEIGHT}px` }}
                    >
                      <div className="mt-0.5">
                        {item.kind === 'block' ? (
                          <CalendarClock className="h-4 w-4 text-sky-700" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="w-full min-w-0 text-left"
                          onClick={() => handleRowAction(item)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {item.department ? (
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${colorByDepartment(item.department)}`}>
                                {item.department}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                              {item.kind === 'block' ? 'Bloc' : 'Tasca'}
                            </span>
                          </div>
                          <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                            {item.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            {item.owner ? <span>{item.owner}</span> : null}
                            <span>{shortDate(item.start)} - {shortDate(item.end)}</span>
                            {item.kind === 'block' ? (
                              <span className="font-medium text-sky-700">Clica per veure tasques</span>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    </div>

                    <div
                      className="relative grid border-b border-slate-200 bg-white"
                      style={{
                        minHeight: `${ROW_HEIGHT}px`,
                        gridColumn: `2 / span ${timeColumns.length}`,
                        gridTemplateColumns: `repeat(${timeColumns.length}, minmax(${timelineColumnWidth}px, 1fr))`,
                      }}
                    >
                      {timeColumns.map((column) => (
                        <div
                          key={`${item.id}-${column.key}`}
                          className="border-r border-dashed border-slate-200 last:border-r-0"
                        />
                      ))}

                      <div
                        className="pointer-events-none absolute inset-0 grid px-2 py-3"
                        style={{ gridTemplateColumns: `repeat(${timeColumns.length}, minmax(${timelineColumnWidth}px, 1fr))` }}
                      >
                        <div
                          className="pointer-events-auto flex items-center"
                          style={{ gridColumn: `${item.startColumn} / ${item.endColumn + 1}` }}
                        >
                          <button
                            type="button"
                            className={`w-full rounded-[18px] px-4 py-3 text-left ring-1 transition hover:shadow-sm ${laneBarTone(item.kind, item.status)}`}
                            onClick={() => handleRowAction(item)}
                          >
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold">{item.title}</div>
                              <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium">
                                {shortDate(item.end)}
                              </span>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${countdownTone(item.daysLeft)}`}>
                                {countdownLabel(item.daysLeft)}
                              </span>
                            </div>
                            {item.subtitle ? (
                              <div className="mt-2 truncate text-xs opacity-80">
                                {item.subtitle}
                              </div>
                            ) : null}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
