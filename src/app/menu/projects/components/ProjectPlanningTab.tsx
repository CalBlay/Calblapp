'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, ExternalLink, FileText, Milestone, Target, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import { formatProjectDate, getBlockDepartments, type ProjectData } from './project-shared'
import {
  canOpenMeetingActaForScope,
  canOpenMeetingActaInBlocks,
  canOpenMeetingActaInTasks,
  type MeetingActaUser,
} from './project-meeting-acta'
import { projectEmptyStateClass, projectModuleShellClass } from './project-ui'

type PlanningMeetingMeta = {
  scope: 'kickoff' | 'block' | 'task'
  blockId?: string
  taskId?: string
  meetingId?: string
  date?: string
  startTime?: string
  durationMinutes?: number
  calendarUrl?: string
  joinUrl?: string
}

type Props = {
  projectId: string
  project: ProjectData
  canConvokeMeetings?: boolean
  meetingActaUser?: MeetingActaUser
  onOpenMeetingMinutes?: () => void
  onOpenBlockMeeting?: (blockId: string) => void
  onOpenTaskMeeting?: (blockId: string, taskId: string) => void
  onNavigateToBlock?: (blockId: string) => void
  onNavigateToTask?: (blockId: string, taskId: string) => void
}

type LaneKind = 'milestone' | 'meeting' | 'block' | 'task'
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
  meeting?: PlanningMeetingMeta
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
  if (kind === 'milestone') return <Milestone className="h-4 w-4 text-violet-700" />
  if (kind === 'meeting') return <Users className="h-4 w-4 text-orange-700" />
  if (kind === 'block') return <CalendarClock className="h-4 w-4 text-indigo-700" />
  return <CheckCircle2 className="h-4 w-4 text-emerald-700" />
}

/** Color de la fila segons tipus d'element (no estat). */
const badgeTone = (kind: LaneKind) => {
  if (kind === 'milestone') return 'bg-violet-200 text-violet-950 ring-1 ring-violet-400'
  if (kind === 'meeting') return 'bg-orange-200 text-orange-950 ring-1 ring-orange-400'
  if (kind === 'block') return 'bg-indigo-200 text-indigo-950 ring-1 ring-indigo-400'
  return 'bg-emerald-200 text-emerald-950 ring-1 ring-emerald-400'
}

/** Tipus efectiu per pintar barres: reunions puntuals inclouen fites amb `meeting`. */
const barLaneKind = (item: Pick<PlanningItem, 'kind' | 'meeting'>): LaneKind =>
  item.meeting ? 'meeting' : item.kind

/** Color de barres i pills del timeline segons tipus (+ estat dins la mateixa família). */
const laneBarTone = (kind: LaneKind, status?: string) => {
  if (kind === 'milestone') {
    if (status === 'done') return 'bg-violet-300 text-violet-950 ring-violet-400'
    return 'bg-violet-200 text-violet-900 ring-violet-300'
  }
  if (kind === 'meeting') {
    if (status === 'done' || status === 'completed') return 'bg-orange-300 text-orange-950 ring-orange-400'
    if (status === 'cancelled') return 'bg-slate-200 text-slate-700 ring-slate-300'
    return 'bg-orange-200 text-orange-900 ring-orange-300'
  }
  if (kind === 'block') {
    if (status === 'done') return 'bg-indigo-300 text-indigo-950 ring-indigo-400'
    if (status === 'blocked') return 'bg-rose-200 text-rose-900 ring-rose-300'
    if (status === 'in_progress') return 'bg-indigo-200 text-indigo-900 ring-indigo-300'
    if (status === 'overdue') return 'bg-amber-200 text-amber-900 ring-amber-300'
    return 'bg-indigo-100 text-indigo-800 ring-indigo-200'
  }
  if (status === 'done') return 'bg-emerald-300 text-emerald-950 ring-emerald-400'
  if (status === 'blocked') return 'bg-rose-200 text-rose-900 ring-rose-300'
  if (status === 'in_progress') return 'bg-teal-200 text-teal-900 ring-teal-300'
  if (status === 'overdue') return 'bg-amber-200 text-amber-900 ring-amber-300'
  return 'bg-emerald-100 text-emerald-800 ring-emerald-200'
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

const formatMeetingTime = (date?: string, startTime?: string) => {
  const dateLabel = date ? formatProjectDate(date) : 'Sense data'
  const timeLabel = String(startTime || '').trim()
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel
}

export default function ProjectPlanningTab({
  projectId,
  project,
  canConvokeMeetings = false,
  meetingActaUser,
  onOpenMeetingMinutes,
  onOpenBlockMeeting,
  onOpenTaskMeeting,
  onNavigateToBlock,
  onNavigateToTask,
}: Props) {
  const [entityFilter, setEntityFilter] = useState<'all' | LaneKind>('all')
  const [selectedMeetingItem, setSelectedMeetingItem] = useState<PlanningItem | null>(null)
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
            href: `/menu/projects/${projectId}?tab=blocks`,
            meeting: {
              scope: 'kickoff',
              date: project.kickoff.date,
              startTime: project.kickoff.startTime,
              durationMinutes: project.kickoff.durationMinutes,
              calendarUrl: project.kickoff.graphWebLink || undefined,
              joinUrl: project.kickoff.graphJoinUrl || undefined,
            },
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

    const meetings = project.blocks.flatMap((block) => {
      const blockMeetings = (block.meetings || []).map((meeting) => {
        const meetingStart = parseDate(meeting.date)
        if (!meetingStart) return null
        const durationMinutes = Number(meeting.durationMinutes || 60)
        const meetingEnd = addDays(meetingStart, 0)
        meetingEnd.setHours(
          meetingStart.getHours() + Math.floor(durationMinutes / 60),
          meetingStart.getMinutes() + (durationMinutes % 60)
        )
        return {
          id: `meeting-block-${meeting.id}`,
          kind: 'meeting' as const,
          title: `Reunió bloc · ${meeting.title || block.name || 'Bloc'}`,
          subtitle: block.name || 'Bloc',
          department: getBlockDepartments(block)[0] || '',
          owner: block.owner || '',
          status: meeting.status || 'scheduled',
          start: meetingStart,
          end: meetingStart,
          href: `/menu/projects/${projectId}?tab=blocks`,
          meeting: {
            scope: 'block',
            blockId: block.id,
            meetingId: meeting.id,
            date: meeting.date,
            startTime: meeting.startTime,
            durationMinutes: meeting.durationMinutes,
            calendarUrl: meeting.graphWebLink || undefined,
            joinUrl: meeting.graphJoinUrl || undefined,
          },
        }
      })

      const taskMeetings = (block.tasks || []).flatMap((task) =>
        (task.meetings || []).map((meeting) => {
          const meetingStart = parseDate(meeting.date)
          if (!meetingStart) return null
          return {
            id: `meeting-task-${meeting.id}`,
            kind: 'meeting' as const,
            title: `Reunió tasca · ${meeting.title || task.title || 'Tasca'}`,
            subtitle: `${task.title || 'Tasca'} · ${block.name || 'Bloc'}`,
            department: task.department || getBlockDepartments(block)[0] || '',
            owner: task.owner || block.owner || '',
            status: meeting.status || 'scheduled',
            start: meetingStart,
            end: meetingStart,
            href: `/menu/projects/${projectId}?tab=tasks`,
            meeting: {
              scope: 'task',
              blockId: block.id,
              taskId: task.id,
              meetingId: meeting.id,
              date: meeting.date,
              startTime: meeting.startTime,
              durationMinutes: meeting.durationMinutes,
              calendarUrl: meeting.graphWebLink || undefined,
              joinUrl: meeting.graphJoinUrl || undefined,
            },
          }
        })
      )

      return [...blockMeetings, ...taskMeetings].filter(Boolean)
    }) as PlanningItem[]

    return [...milestones, ...meetings, ...blocks, ...tasks]
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
          isInstant: item.kind === 'milestone' || item.kind === 'meeting',
        }
      })
      .sort((left, right) => {
        const order = { milestone: 0, meeting: 1, block: 2, task: 3 }
        if (order[left.kind] !== order[right.kind]) return order[left.kind] - order[right.kind]
        if (left.start.getTime() !== right.start.getTime()) return left.start.getTime() - right.start.getTime()
        return left.title.localeCompare(right.title)
      })
  }, [timeColumns, visibleItems])

  const projectCountdown = useMemo(() => diffDays(new Date(), projectEndAt), [projectEndAt])

  const planningSummary = useMemo(() => {
    const blockCount = items.filter((item) => item.kind === 'block').length
    const milestoneCount = items.filter((item) => item.kind === 'milestone').length
    const meetingCount = items.filter((item) => item.kind === 'meeting').length
    return { blockCount, milestoneCount, meetingCount }
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
              <SelectItem value="meeting">Reunions</SelectItem>
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

  const selectedMeeting = selectedMeetingItem?.meeting
  const canOpenPlanningActa =
    Boolean(meetingActaUser) &&
    (canOpenMeetingActaInBlocks(meetingActaUser!, project) ||
      canOpenMeetingActaInTasks(meetingActaUser!, project))
  const canOpenSelectedMeetingActa =
    Boolean(meetingActaUser && selectedMeeting) &&
    canOpenMeetingActaForScope(meetingActaUser!, project, selectedMeeting!.scope, {
      blockId: selectedMeeting?.blockId,
      taskId: selectedMeeting?.taskId,
      meetingId: selectedMeeting?.meetingId,
    })
  const meetingMinutesLabel =
    project.kickoff.minutesStatus === 'closed'
      ? 'Tancar acta'
      : String(project.kickoff.minutes || '').trim()
        ? 'Apunts reunió'
        : 'Acta reunió'

  const openSelectedMeetingContext = () => {
    if (!selectedMeeting) return
    if (selectedMeeting.scope === 'task' && selectedMeeting.blockId && selectedMeeting.taskId) {
      onNavigateToTask?.(selectedMeeting.blockId, selectedMeeting.taskId)
    } else if (selectedMeeting.scope === 'block' && selectedMeeting.blockId) {
      onNavigateToBlock?.(selectedMeeting.blockId)
    } else {
      onNavigateToBlock?.(project.blocks[0]?.id || '')
    }
    setSelectedMeetingItem(null)
  }

  const convokeFromSelectedMeeting = () => {
    if (!selectedMeeting) return
    if (selectedMeeting.scope === 'task' && selectedMeeting.blockId && selectedMeeting.taskId) {
      onOpenTaskMeeting?.(selectedMeeting.blockId, selectedMeeting.taskId)
    } else if (selectedMeeting.blockId) {
      onOpenBlockMeeting?.(selectedMeeting.blockId)
    }
    setSelectedMeetingItem(null)
  }

  const renderInstantPill = (item: TimelineRenderItem) => {
    const isOpenable = Boolean(item.meeting)
    const lane = barLaneKind(item)
    const pillClass = `inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ring-1 ${laneBarTone(lane, item.status)} ${isOpenable ? 'cursor-pointer transition hover:shadow-md hover:ring-2' : ''}`

    const content = (
      <>
        <span className="truncate">{item.title}</span>
        <span className="rounded-full bg-white/70 px-2 py-0.5">{shortDate(item.start)}</span>
      </>
    )

    if (!isOpenable) {
      return <div className={pillClass}>{content}</div>
    }

    return (
      <button
        type="button"
        className={pillClass}
        onClick={() => setSelectedMeetingItem(item)}
        title="Obrir reunió"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <section className={cn(projectModuleShellClass, 'p-5')}>
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
            <div className="hidden items-center gap-2 rounded-full bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-200 xl:inline-flex">
              <CalendarClock className="h-4 w-4 text-indigo-700" />
              {planningSummary.blockCount} blocs
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-900 ring-1 ring-violet-200 xl:inline-flex">
              <Milestone className="h-4 w-4 text-violet-700" />
              {planningSummary.milestoneCount} fites
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-orange-100 px-3 py-2 text-xs font-semibold text-orange-900 ring-1 ring-orange-200 xl:inline-flex">
              <Users className="h-4 w-4 text-orange-700" />
              {planningSummary.meetingCount} reunions
            </div>
            {canOpenPlanningActa && onOpenMeetingMinutes ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onOpenMeetingMinutes}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                {meetingMinutesLabel}
              </Button>
            ) : null}
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
                            {item.kind === 'milestone'
                              ? 'Fita'
                              : item.kind === 'meeting'
                                ? 'Reunió'
                                : item.kind === 'block'
                                  ? 'Bloc'
                                  : 'Tasca'}
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
                            {renderInstantPill(item)}
                          </div>
                        ) : (
                          <div
                            className="pointer-events-auto flex items-center"
                            style={{ gridColumn: `${item.startColumn} / ${item.endColumn + 1}` }}
                          >
                            <div className={`w-full rounded-[18px] px-4 py-3 ring-1 ${laneBarTone(item.kind, item.status)}`}>
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

      <Dialog open={Boolean(selectedMeetingItem)} onOpenChange={(open) => !open && setSelectedMeetingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMeetingItem?.title || 'Reunió'}</DialogTitle>
            <DialogDescription>
              {selectedMeetingItem?.subtitle || 'Detalls de la convocatòria'}
              {selectedMeeting ? (
                <span className="mt-1 block text-slate-600">
                  {formatMeetingTime(selectedMeeting.date, selectedMeeting.startTime)}
                  {selectedMeeting.durationMinutes
                    ? ` · ${selectedMeeting.durationMinutes} min`
                    : ''}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {selectedMeeting?.calendarUrl ? (
              <Button type="button" variant="outline" className="justify-start gap-2" asChild>
                <a href={selectedMeeting.calendarUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Obrir al calendari
                </a>
              </Button>
            ) : null}
            {selectedMeeting?.joinUrl ? (
              <Button type="button" className="justify-start gap-2 bg-violet-600 text-white hover:bg-violet-700" asChild>
                <a href={selectedMeeting.joinUrl} target="_blank" rel="noreferrer">
                  <Users className="h-4 w-4" />
                  Unir-se a la reunió
                </a>
              </Button>
            ) : null}
            {selectedMeeting?.scope === 'kickoff' || selectedMeeting?.scope === 'block' || selectedMeeting?.scope === 'task' ? (
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={openSelectedMeetingContext}>
                <CalendarClock className="h-4 w-4" />
                {selectedMeeting?.scope === 'task'
                  ? 'Anar a la tasca'
                  : selectedMeeting?.scope === 'kickoff'
                    ? 'Anar als blocs'
                    : 'Anar al bloc'}
              </Button>
            ) : null}
            {canOpenSelectedMeetingActa && onOpenMeetingMinutes ? (
              <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => {
                setSelectedMeetingItem(null)
                onOpenMeetingMinutes()
              }}>
                <FileText className="h-4 w-4" />
                Obrir acta
              </Button>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setSelectedMeetingItem(null)}>
              Tancar
            </Button>
            {canConvokeMeetings &&
            selectedMeeting &&
            selectedMeeting.scope !== 'kickoff' &&
            (onOpenBlockMeeting || onOpenTaskMeeting) ? (
              <Button type="button" onClick={convokeFromSelectedMeeting}>
                Convocar reunió
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
