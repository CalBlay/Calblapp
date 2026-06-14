// file: src/app/menu/incidents/components/IncidentsEventHeader.tsx
'use client'

import React from 'react'
import { ChevronDown, MapPin, Tag, UserRound, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { colorByLN } from '@/lib/colors'

interface Props {
  title: string
  code: string
  ln: string
  location: string
  service: string
  pax: number
  count: number
  openCount: number
  urgentCount: number
  allResolved: boolean
  expanded: boolean
  commercial?: string
  className?: string
  headerClassName?: string
  onToggle?: () => void
  onLocationClick?: () => void
}

const formatEventTitle = (title?: string) => {
  if (!title) return '(Sense títol)'
  let t = title.split('/')[0].trim()
  t = t.replace(/^\s*[A-Z]\s*-\s*/i, '').trim()
  const stopIndex = t.search(/#|code/i)
  if (stopIndex > -1) t = t.substring(0, stopIndex).trim()
  return t || '(Sense títol)'
}

export default function IncidentsEventHeader({
  title,
  code,
  ln,
  location,
  service,
  pax,
  count,
  openCount,
  urgentCount,
  allResolved,
  expanded,
  commercial,
  className,
  headerClassName,
  onToggle,
  onLocationClick,
}: Props) {
  const displayTitle = formatEventTitle(title)
  const lnColor = colorByLN(ln || 'altres')

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
        'flex w-full cursor-pointer flex-col gap-2 px-4 py-3.5 text-left transition sm:px-5 sm:py-4',
        headerClassName,
        className
      )}
      aria-expanded={expanded}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className="line-clamp-2 min-w-0 flex-1 text-base font-bold leading-snug text-slate-900 sm:line-clamp-2 sm:text-[17px]"
          title={displayTitle}
        >
          {displayTitle}
        </h3>

        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm transition',
            expanded ? 'border-slate-300 text-slate-700' : 'border-slate-200 text-slate-500'
          )}
        >
          <ChevronDown
            className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')}
            aria-hidden
          />
        </span>
      </div>

      {(code || location || commercial || service) ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 sm:text-sm">
        {code ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-slate-500">
            <Tag className="h-3 w-3" aria-hidden />
            {code}
          </span>
        ) : null}
        {location ? (
          <span
            role="button"
            tabIndex={0}
            className="inline-flex max-w-full items-start gap-1.5 font-medium text-slate-700 underline-offset-2 hover:text-blue-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              onLocationClick?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onLocationClick?.()
              }
            }}
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="line-clamp-1">{location}</span>
          </span>
        ) : null}

        {commercial ? (
          <span className="inline-flex max-w-[12rem] items-center gap-1.5 truncate">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{commercial}</span>
          </span>
        ) : null}

        {service ? <span className="text-slate-500">{service}</span> : null}
      </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {ln ? (
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', lnColor)}>
              {ln.charAt(0).toUpperCase() + ln.slice(1)}
            </span>
          ) : null}

          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            {count === 1 ? '1 inc.' : `${count} inc.`}
          </span>

          {allResolved ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Tot resolt
            </span>
          ) : (
            <>
              {urgentCount > 0 ? (
                <span className="rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
                  {urgentCount === 1 ? '1 urgent/alta' : `${urgentCount} urgent/alta`}
                </span>
              ) : null}
              {openCount > urgentCount ? (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                  {openCount - urgentCount === 1
                    ? '1 oberta'
                    : `${openCount - urgentCount} obertes`}
                </span>
              ) : null}
            </>
          )}
        </div>

        {pax > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-xs font-bold text-pink-700">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {pax}
          </span>
        ) : null}
      </div>
    </div>
  )
}
