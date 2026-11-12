import { cn } from '@/lib/utils'
import type { PersonnelWorkloadSummary } from '@/lib/personnelWorkload'

const toneClasses = {
  green: 'bg-emerald-500',
  orange: 'bg-orange-500',
  red: 'bg-red-600',
} as const

const toneIcons = {
  green: '🟢',
  orange: '🟠',
  red: '🔴',
} as const

const hours = (value: number) => `${Number(value || 0).toFixed(1)} h`

export function personnelWorkloadTitle(workload?: PersonnelWorkloadSummary) {
  if (!workload) return 'Càrrega horària no disponible'
  const monthlyWarning = workload.monthlyExceeded
    ? ` Límit mensual superat: ${hours(workload.monthlyActualHours)} de ${hours(workload.monthlyLimitHours)}.`
    : ` Mes real: ${hours(workload.monthlyActualHours)} de ${hours(workload.monthlyLimitHours)}.`
  return `Setmana: ${hours(workload.weeklyHours)}. Aquest servei: ${hours(workload.candidateHours)}. Total previst: ${hours(workload.projectedWeeklyHours)} de ${hours(workload.maxHoursWeek)}.${monthlyWarning}`
}

export function formatPersonnelWorkloadLabel(
  name: string,
  workload?: PersonnelWorkloadSummary
) {
  if (!workload) return name
  const monthly = workload.monthlyExceeded ? ' · mensual superat' : ''
  return `${toneIcons[workload.weeklyTone]} ${name} · ${workload.weeklyHours.toFixed(1)}/${workload.maxHoursWeek.toFixed(1)} h${monthly}`
}

export function PersonnelWorkloadIndicator({
  workload,
  className,
  showHours = true,
}: {
  workload?: PersonnelWorkloadSummary
  className?: string
  showHours?: boolean
}) {
  if (!workload) return null
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-slate-500', className)}
      title={personnelWorkloadTitle(workload)}
      aria-label={personnelWorkloadTitle(workload)}
    >
      <span
        className={cn('h-2.5 w-2.5 rounded-full ring-2 ring-white', toneClasses[workload.weeklyTone])}
        aria-hidden
      />
      {showHours ? (
        <span>{workload.weeklyHours.toFixed(1)}/{workload.maxHoursWeek.toFixed(1)} h</span>
      ) : null}
    </span>
  )
}
