'use client'

import React from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, HardHat, Loader2, MapPin, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import { colorByLN } from '@/lib/colors'
import {
  formatEventTitle,
  quadrantStatusLabel,
  type QuadrantPersonnelSummary,
} from '@/lib/quadrantsDisplayUtils'
import type { QuadrantEventGroupMeta } from '@/lib/quadrantEventGroupMeta'
import QuadrantsPersonnelList from './QuadrantsPersonnelList'

interface Props {
  title: string
  code: string
  ln: string | null
  location: string | null
  service: string | null
  pax: number | null
  commercial?: string | null
  meta: QuadrantEventGroupMeta
  personnel: QuadrantPersonnelSummary
  expanded: boolean
  hidePersonnel?: boolean
  assignedStaffCount?: number
  showConfirm?: boolean
  confirmLoading?: boolean
  className?: string
  headerClassName?: string
  onToggle?: () => void
  onConfirm?: () => void
}

function statusDotClass(status: string) {
  if (status === 'confirmed') return 'bg-green-500'
  if (status === 'draft') return 'bg-blue-500'
  return 'bg-yellow-400'
}

function MetaSep() {
  return <span className="text-slate-300" aria-hidden>·</span>
}

function PhaseStatusDots({ personnel }: { personnel: QuadrantPersonnelSummary }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={personnel.phaseLines
        .map((line) => `${line.phaseLabel}: ${quadrantStatusLabel(line.status)}`)
        .join(' · ')}
    >
      {personnel.phaseLines.map((line, idx) => (
        <span
          key={`${line.phaseLabel}-${idx}`}
          className={cn('inline-block h-2.5 w-2.5 rounded-full', statusDotClass(line.status))}
          aria-hidden
        />
      ))}
    </span>
  )
}

export default function QuadrantsEventHeader({
  title,
  code,
  ln,
  location,
  service,
  pax,
  commercial,
  meta,
  personnel,
  expanded,
  hidePersonnel = false,
  assignedStaffCount = 0,
  showConfirm = false,
  confirmLoading = false,
  className,
  headerClassName,
  onToggle,
  onConfirm,
}: Props) {
  const displayTitle = formatEventTitle(title)
  const lnColor = colorByLN(ln || 'altres')
  const showPhaseStaffLines = personnel.phaseLines.length > 1

  const scheduleLabel =
    personnel.primaryStartTime || personnel.primaryEndTime
      ? `${personnel.primaryStartTime || '--:--'} – ${personnel.primaryEndTime || '--:--'}`
      : personnel.primarySchedule

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle?.()
        }
      }}
      className={cn(
        'flex w-full cursor-pointer flex-col gap-2 px-3.5 py-3 text-left transition sm:px-4 sm:py-3.5',
        headerClassName,
        className
      )}
      aria-expanded={expanded}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-snug text-slate-900 sm:text-base"
          title={displayTitle}
        >
          {displayTitle}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {showConfirm ? (
            <Button
              type="button"
              size="sm"
              className="h-8 w-8 rounded-full bg-emerald-500 p-0 text-white shadow hover:bg-emerald-600"
              onClick={(e) => {
                e.stopPropagation()
                onConfirm?.()
              }}
              disabled={confirmLoading}
              title="Confirmar quadrant"
              aria-label="Confirmar quadrant"
            >
              {confirmLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              )}
            </Button>
          ) : null}
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm transition',
              expanded ? 'border-slate-300 text-slate-700' : 'border-slate-200 text-slate-500'
            )}
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
              aria-hidden
            />
          </span>
        </div>
      </div>

      {/* LN · pax (esquerra) · treb. (dreta) · estat */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {ln ? (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', lnColor)}>
              {ln.charAt(0).toUpperCase() + ln.slice(1)}
            </span>
          ) : null}
          {pax && pax > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[11px] font-bold text-pink-700">
              <Users className="h-3 w-3" aria-hidden />
              {pax} pax
            </span>
          ) : null}
          <PhaseStatusDots personnel={personnel} />
          {meta.hasOverlapWarning ? (
            <span className="text-amber-600" title="Possible solapament de personal">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null}
          {meta.hasSurvey ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
              title="Sondeig enviat"
              aria-hidden
            />
          ) : null}
        </div>
        {assignedStaffCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
            <HardHat className="h-3 w-3" aria-hidden />
            {assignedStaffCount} treb.
          </span>
        ) : null}
      </div>

      {/* Ubicació · codi · comercial */}
      {(location || code || commercial) ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600',
            typography('bodySm')
          )}
        >
          {location ? (
            <span className="inline-flex max-w-full items-center gap-1 font-medium text-slate-700">
              <MapPin className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              <span className="line-clamp-1">{location}</span>
            </span>
          ) : null}
          {location && (code || commercial) ? <MetaSep /> : null}
          {code ? <span className="font-mono text-[11px] font-semibold text-slate-500">{code}</span> : null}
          {code && commercial ? <MetaSep /> : null}
          {commercial ? <span className="line-clamp-1 text-slate-600">{commercial}</span> : null}
        </div>
      ) : null}

      {/* Servei · hora inici – hora fi */}
      {(service || scheduleLabel) ? (
        <div className={cn('flex flex-wrap items-center gap-x-1.5 text-xs text-slate-700', typography('bodySm'))}>
          {service ? <span className="font-medium text-slate-800">{service}</span> : null}
          {service && scheduleLabel ? <MetaSep /> : null}
          {scheduleLabel ? (
            <span className="font-semibold tabular-nums text-slate-900">{scheduleLabel}</span>
          ) : null}
        </div>
      ) : null}

      {/* Personal */}
      {!hidePersonnel ? (
      <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-2.5 py-2">
        {!personnel.hasAnyAssignment ? (
          <p className={cn('text-slate-500 italic', typography('bodyXs'))}>Sense personal assignat</p>
        ) : showPhaseStaffLines ? (
          <ul className="space-y-1.5">
            {personnel.phaseLines.map((line, idx) => (
              <li key={`${line.phaseLabel}-${idx}`} className="flex items-start gap-1.5">
                <span
                  className={cn(
                    'mt-1 inline-block h-2 w-2 shrink-0 rounded-full',
                    statusDotClass(line.status)
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-slate-800', typography('bodyXs'))}>
                    <span className="font-bold uppercase tracking-wide text-slate-600">
                      {line.phaseLabel}
                    </span>
                  </p>
                  {line.people.length > 0 ? (
                    <QuadrantsPersonnelList people={line.people} className="mt-0.5" inline={false} />
                  ) : (
                    <p className={cn('italic text-slate-500', typography('bodyXs'))}>Sense personal</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <QuadrantsPersonnelList people={personnel.people} />
        )}
      </div>
      ) : null}
    </div>
  )
}
