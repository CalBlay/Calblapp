'use client'

import { FileText, TimerReset, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatProjectDate, type ProjectData } from './project-shared'
import { projectPanelClass } from './project-ui'

type Props = {
  project: ProjectData
  compact?: boolean
  canEditLaunchDate?: boolean
  dirtyLaunchDate?: boolean
  savingLaunchDate?: boolean
  onLaunchDateChange?: (value: string) => void
  onSaveLaunchDate?: () => void
}

const parseProjectCreatedAt = (value?: string | number | null) => {
  if (typeof value === 'number' && value > 0) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const raw = String(value || '').trim()
  if (!raw) return null

  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  return Number.isNaN(date.getTime()) ? null : date
}

const projectDaysRunning = (value?: string | number | null) => {
  const createdAt = parseProjectCreatedAt(value)
  if (!createdAt) return null

  const start = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000))
}

export function projectDeadlineStatus(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return { label: 'Sense data límit', tone: 'text-slate-500' }
  const target = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(target.getTime())) return { label: 'Sense data límit', tone: 'text-slate-500' }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { label: `Vençut fa ${Math.abs(diff)} dies`, tone: 'text-rose-700' }
  if (diff === 0) return { label: 'Venç avui', tone: 'text-amber-800' }
  if (diff === 1) return { label: 'Queda 1 dia', tone: 'text-emerald-700' }
  return { label: `Queden ${diff} dies`, tone: 'text-emerald-700' }
}

function SummaryCard({
  icon,
  label,
  value,
  className,
  compact = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  className?: string
  compact?: boolean
}) {
  return (
    <article
      className={cn(
        projectPanelClass,
        compact ? 'rounded-[22px] p-4' : 'rounded-[24px] p-5',
        className
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
        {icon}
        {label}
      </div>
      <div className={cn('mt-2 font-semibold text-slate-900', compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg')}>
        {value}
      </div>
    </article>
  )
}

export function projectDaysRunningLabel(value?: string | number | null) {
  const daysRunning = projectDaysRunning(value)
  return daysRunning === null ? 'Sense data' : `${daysRunning} dies`
}

export default function ProjectSummaryStrip({
  project,
  compact = false,
  canEditLaunchDate = false,
  dirtyLaunchDate = false,
  savingLaunchDate = false,
  onLaunchDateChange,
  onSaveLaunchDate,
}: Props) {
  const summary =
    String(project.strategy || '').trim() ||
    String(project.context || '').trim() ||
    'Sense objectius del projecte'
  const owner = String(project.owner || '').trim() || 'Sense responsable'
  const daysRunningLabel = projectDaysRunningLabel(project.createdAt)
  const deadlineStatus = projectDeadlineStatus(project.launchDate)

  if (compact) {
    return (
      <article className={cn(projectPanelClass, 'rounded-[20px] px-4 py-2.5 sm:px-5')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700">
            <FileText className="h-3.5 w-3.5" />
            Objectius del projecte
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {summary}
          </p>
        </div>
      </article>
    )
  }

  return (
    <div className="grid gap-3 xl:grid-cols-4">
      <SummaryCard
        icon={<FileText className="h-4 w-4" />}
        label="Objectius del projecte"
        value={summary}
        className="xl:col-span-1"
        compact={false}
      />
      <SummaryCard
        icon={<UserRound className="h-4 w-4" />}
        label="Responsable"
        value={owner}
        compact={false}
      />
      <SummaryCard
        icon={<TimerReset className="h-4 w-4" />}
        label="Dies en marxa"
        value={daysRunningLabel}
        compact={false}
      />
      <article className={cn(projectPanelClass, 'rounded-[24px] p-5')}>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
          <TimerReset className="h-4 w-4" />
          Data límit del projecte
        </div>

        {canEditLaunchDate && onLaunchDateChange && onSaveLaunchDate ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={project.launchDate || ''}
              onChange={(event) => onLaunchDateChange(event.target.value)}
              className="h-10 w-auto min-w-[160px] bg-white"
            />
            <div className={cn('text-sm font-semibold', deadlineStatus.tone)}>{deadlineStatus.label}</div>
            <Button
              type="button"
              size="sm"
              onClick={onSaveLaunchDate}
              disabled={savingLaunchDate || !dirtyLaunchDate}
              className="w-fit bg-violet-600 text-white hover:bg-violet-700"
            >
              {savingLaunchDate ? 'Guardant...' : 'Guardar data'}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-2 font-semibold text-slate-900 text-base sm:text-lg">
              {formatProjectDate(project.launchDate)}
            </div>
            <div className={cn('mt-2 text-sm font-semibold', deadlineStatus.tone)}>{deadlineStatus.label}</div>
          </>
        )}
      </article>
    </div>
  )
}
