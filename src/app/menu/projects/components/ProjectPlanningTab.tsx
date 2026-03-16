'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Milestone, Target } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { colorByDepartment } from '@/lib/colors'
import { formatProjectDate, getBlockDepartments, type ProjectData } from './project-shared'
import { projectEmptyStateClass } from './project-ui'

type Props = {
  projectId: string
  project: ProjectData
}

type LaneKind = 'milestone' | 'block' | 'task'
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
  href: string
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
  isInstant: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const LABEL_COLUMN_WIDTH = 220
const DAY_COLUMN_WIDTH = 74
const WEEK_COLUMN_WIDTH = 132
const ROW_HEIGHT = 52

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
    : 'Sense data'

const rangeLabel = (start: Date, end: Date) => `${shortDate(start)} - ${shortDate(end)}`

const monthBandLabel = (value: Date) =>
  value.toLocaleDateString('ca-ES', {
    month: '2-digit',
    year: 'numeric',
  })

const laneIcon = (kind: LaneKind) => {
  if (kind === 'milestone') return <Milestone className="h-4 w-4 text-violet-600" />
  if (kind === 'block') return <CalendarClock className="h-4 w-4 text-sky-600" />
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
}

const badgeTone = (kind: LaneKind) => {
  if (kind === 'milestone') return 'bg-violet-100 text-violet-700 ring-violet-200'
  if (kind === 'block') return 'bg-sky-100 text-sky-700 ring-sky-200'
  return 'bg-emerald-100 text-emerald-700 ring-emerald-200'
}

const statusTone = (status?: string) => {
  if (status === 'done') return 'bg-emerald-100 text-emerald-700 ring-emerald-200'
  if (status === 'blocked') return 'bg-rose-100 text-rose-700 ring-rose-200'
  if (status === 'in_progress') return 'bg-sky-100 text-sky-700 ring-sky-200'
  if (status === 'overdue') return 'bg-amber-100 text-amber-800 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

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

const getProjectCreatedDate = (project: ProjectData) => parseDate(project.createdAt)

const findColumnIndex = (columns: TimelineColumn[], value: Date) => {
  const point = toStartOfDay(value).getTime()
  const index = columns.findIndex((column) => {
    const start = toStartOfDay(column.start).getTime()
    const end = toStartOfDay(column.end).getTime()
    return point >= start && point <= end
  })
  return index === -1 ? Math.max(0, columns.length - 1) : index
}

export default function ProjectPlanningTab({ projectId, project }: Props) {
  const [entityFilter, setEntityFilter] = useState<'all' | LaneKind>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const { setOpen, setContent } = useFilters()

  const projectCreatedAt = useMemo(
    () => getProjectCreatedDate(project) || parseDate(project.startDate) || new Date(),
    [project]
  )
  const projectEndAt = useMemo(
    () => parseDate(project.launchDate) || projectCreatedAt,
    [project.launchDate, projectCreatedAt]
  )
  const totalProjectDays = useMemo(
    () => Math.max(1, diffDays(projectCreatedAt, projectEndAt) + 1),
    [projectCreatedAt, projectEndAt]
  )
  const timeScale: TimeScale = totalProjectDays <= 14 ? 'day' : 'week'

  const items = useMemo<PlanningItem[]>(() => {
    const kickoffDate = parseDate(project.kickoff?.date)
    const projectStartDate = parseDate(project.startDate)
    const projectLaunchDate = parseDate(project.launchDate)

    const milestones: PlanningItem[] = [
      {
        id: 'milestone-created',
        kind: 'milestone',
        title: 'Creació del projecte',
        subtitle: project.name || 'Projecte',
        status: 'done',
        start: projectCreatedAt,
        end: projectCreatedAt,
        href: `/menu/projects/${projectId}?tab=overview`,
      },
      projectStartDate
        ? {
            id: 'milestone-start',
            kind: 'milestone',
            title: 'Inici del projecte',
            subtitle: project.name || 'Projecte',
            status: 'done',
            start: projectStartDate,
            end: projectStartDate,
            href: `/menu/projects/${projectId}?tab=overview`,
          }
        : null,
      kickoffDate
        ? {
            id: 'milestone-kickoff',
            kind: 'milestone',
            title: "Reunió d'arrencada",
            subtitle: "Convocatòria de llançament",
            status: project.kickoff.status || 'in_progress',
            start: kickoffDate,
            end: kickoffDate,
            href: `/menu/projects/${projectId}?tab=kickoff`,
          }
        : null,
      projectLaunchDate
        ? {
            id: 'milestone-launch',
            kind: 'milestone',
            title: 'Entrega projecte',
            subtitle: project.name || 'Projecte',
            status: project.phase === 'closed' ? 'done' : 'in_progress',
            start: projectLaunchDate,
            end: projectLaunchDate,
            href: `/menu/projects/${projectId}?tab=overview`,
          }
        : null,
    ].filter(Boolean) as PlanningItem[]

    const blocks = project.blocks.map((block) => {
      const blockCreatedAt = parseDate(block.createdAt) || projectCreatedAt
      const blockEndAt = parseDate(block.deadline) || blockCreatedAt
      return {
        id: `block-${block.id}`,
        kind: 'block' as const,
        title: block.name || 'Bloc',
        subtitle: block.summary || 'Sense resum',
        department: getBlockDepartments(block)[0] || '',
        owner: block.owner || '',
        status: block.status || 'pending',
        start: blockCreatedAt,
        end: blockEndAt,
        href: `/menu/projects/${projectId}?tab=blocks`,
      }
    })

    const tasks = project.blocks.flatMap((block) => {
      const blockCreatedAt = parseDate(block.createdAt) || projectCreatedAt
      return (block.tasks || []).map((task) => {
        const taskCreatedAt = parseDate(task.createdAt) || blockCreatedAt
        const taskEndAt = parseDate(task.deadline) || taskCreatedAt
        return {
          id: `task-${task.id}`,
          kind: 'task' as const,
          title: task.title || 'Tasca',
          subtitle: block.name || 'Bloc',
          department: task.department || getBlockDepartments(block)[0] || '',
          owner: task.owner || '',
          status: task.status || 'pending',
          start: taskCreatedAt,
          end: taskEndAt,
          href: `/menu/projects/${projectId}?tab=tasks`,
        }
      })
    })

    return [...milestones, ...blocks, ...tasks]
  }, [project, projectCreatedAt, projectId])

  const departments = useMemo(
    () =>
      [...new Set(items.map((item) => item.department || '').filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [items]
  )

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (entityFilter !== 'all' && item.kind !== entityFilter) return false
        if (departmentFilter !== 'all' && item.department !== departmentFilter) return false
        if (statusFilter !== 'all' && (item.status || 'pending') !== statusFilter) return false
        return true
      }),
    [departmentFilter, entityFilter, items, statusFilter]
  )

  const timeColumns = useMemo(() => {
    const columns: TimelineColumn[] = []
    let cursor = toStartOfDay(projectCreatedAt)

    while (cursor <= projectEndAt) {
      const start = cursor
      const end = timeScale === 'day' ? start : addDays(start, 6)
      columns.push({
        key: start.toISOString(),
        start,
        end: end > projectEndAt ? projectEndAt : end,
        label: timeScale === 'day' ? shortDate(start) : rangeLabel(start, end > projectEndAt ? projectEndAt : end),
        monthLabel: monthBandLabel(start),
      })
      cursor = addDays(cursor, timeScale === 'day' ? 1 : 7)
    }

    return columns
  }, [projectCreatedAt, projectEndAt, timeScale])

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
          isInstant: item.kind === 'milestone',
        }
      })
      .sort((left, right) => {
        const order = { milestone: 0, block: 1, task: 2 }
        if (order[left.kind] !== order[right.kind]) return order[left.kind] - order[right.kind]
        if (left.start.getTime() !== right.start.getTime()) return left.start.getTime() - right.start.getTime()
        return left.title.localeCompare(right.title)
      })
  }, [timeColumns, visibleItems])

  const projectCountdown = useMemo(() => diffDays(new Date(), projectEndAt), [projectEndAt])

  const planningSummary = useMemo(() => {
    const blockCount = items.filter((item) => item.kind === 'block').length
    const milestoneCount = items.filter((item) => item.kind === 'milestone').length
    return { blockCount, milestoneCount }
  }, [items])

  const resetFilters = () => {
    setEntityFilter('all')
    setDepartmentFilter('all')
    setStatusFilter('all')
  }

  const openFiltersPanel = () => {
    setContent(
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Element</label>
          <Select value={entityFilter} onValueChange={(value) => setEntityFilter(value as typeof entityFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Tot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tot</SelectItem>
              <SelectItem value="milestone">Fites</SelectItem>
              <SelectItem value="block">Blocs</SelectItem>
              <SelectItem value="task">Tasques</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Departament</label>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tots els departaments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots els departaments</SelectItem>
              {departments.map((department) => (
                <SelectItem key={`planning-filter-department-${department}`} value={department}>
                  {department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Estat</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tots els estats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots els estats</SelectItem>
              <SelectItem value="pending">Pendent</SelectItem>
              <SelectItem value="in_progress">En curs</SelectItem>
              <SelectItem value="blocked">Bloquejat</SelectItem>
              <SelectItem value="done">Fet</SelectItem>
              <SelectItem value="overdue">En retard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end pt-2">
          <ResetFilterButton onClick={resetFilters} />
        </div>
      </div>
    )
    setOpen(true)
  }

  const timelineColumnWidth = timeScale === 'day' ? DAY_COLUMN_WIDTH : WEEK_COLUMN_WIDTH
  const timelineGridColumns = `${LABEL_COLUMN_WIDTH}px repeat(${timeColumns.length}, minmax(${timelineColumnWidth}px, 1fr))`
  const firstColumnClass = 'sticky left-0 z-20 border-r border-slate-200 bg-white'

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white/80 p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 ring-1 ring-violet-200 lg:inline-flex">
              <Target className="h-4 w-4" />
              {formatProjectDate(project.launchDate)}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${countdownTone(projectCountdown)}`}>
                {countdownLabel(projectCountdown)}
              </span>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              {timeScale === 'day' ? 'Vista per dies' : 'Vista per setmanes'}
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              {shortDate(projectCreatedAt)} - {shortDate(projectEndAt)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 xl:inline-flex">
              <CalendarClock className="h-4 w-4 text-sky-600" />
              {planningSummary.blockCount} blocs
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 xl:inline-flex">
              <Milestone className="h-4 w-4 text-emerald-600" />
              {planningSummary.milestoneCount} fites
            </div>
            <FilterButton onClick={openFiltersPanel} />
            <ResetFilterButton onClick={resetFilters} />
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <div className={`mt-5 rounded-[24px] bg-slate-50 px-6 py-10 ${projectEmptyStateClass}`}>
            No hi ha elements visibles amb aquests filtres.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-max">
              <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm">
                <div className="grid gap-0" style={{ gridTemplateColumns: timelineGridColumns }}>
                  <div className="sticky left-0 z-40 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Carrils
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
                    Elements
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
                      <div className="mt-0.5">{laneIcon(item.kind)}</div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${badgeTone(item.kind)}`}>
                            {item.kind === 'milestone' ? 'Fita' : item.kind === 'block' ? 'Bloc' : 'Tasca'}
                          </span>
                          {item.department ? (
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${colorByDepartment(item.department)}`}>
                              {item.department}
                            </span>
                          ) : null}
                        </div>
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
                        {item.isInstant ? (
                          <div
                            className="pointer-events-auto flex items-center"
                            style={{ gridColumn: `${item.startColumn} / span 1` }}
                          >
                            <div className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ring-1 ${statusTone(item.status)}`}>
                              <span className="truncate">{item.title}</span>
                              <span className="rounded-full bg-white/70 px-2 py-0.5">{shortDate(item.start)}</span>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="pointer-events-auto flex items-center"
                            style={{ gridColumn: `${item.startColumn} / ${item.endColumn + 1}` }}
                          >
                            <div className={`w-full rounded-[18px] px-4 py-3 ring-1 ${statusTone(item.status)}`}>
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold">{item.title}</div>
                                {item.owner ? (
                                  <span className="truncate text-xs font-medium opacity-80">
                                    {item.owner}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium">
                                  {shortDate(item.end)}
                                </span>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${countdownTone(item.daysLeft)}`}>
                                  {countdownLabel(item.daysLeft)}
                                </span>
                              </div>
                              <div className="mt-2 truncate text-xs opacity-80">
                                {shortDate(item.start)} - {shortDate(item.end)}
                              </div>
                            </div>
                          </div>
                        )}
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
