'use client'

import {
  EVENT_COMANDA_BATCH_STATUS_LABELS,
} from '@/lib/eventComanda/batchStatus'
import { eventComandaBatchStatusBadgeClass } from '@/lib/eventComanda/ui'
import { corporateFilterBadgeBaseClass } from '@/lib/corporate-filters'
import type { EventComandaBatchStatus } from '@/lib/eventComanda/types'
import { cn } from '@/lib/utils'

const BATCH_STATUS_OPTIONS: EventComandaBatchStatus[] = [
  'pending',
  'in_progress',
  'ready',
  'issue',
  'cancelled',
]

const PREPARER_STATUS_OPTIONS: EventComandaBatchStatus[] = [
  'pending',
  'in_progress',
  'ready',
  'sent',
  'issue',
]

type Props = {
  value: EventComandaBatchStatus
  onSelect?: (status: EventComandaBatchStatus) => void
  saving?: boolean
  className?: string
  /** Flux magatzem: inclou «Enviada» i amaga «Anul·lada». */
  preparerMode?: boolean
}

export default function EventComandaBatchStatusBadges({
  value,
  onSelect,
  saving = false,
  className,
  preparerMode = false,
}: Props) {
  const interactive = Boolean(onSelect)
  const options = preparerMode ? PREPARER_STATUS_OPTIONS : BATCH_STATUS_OPTIONS

  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role={interactive ? 'group' : 'status'}
      aria-label="Estat de la comanda al magatzem"
    >
      {options.map((option) => {
        const active = value === option
        const label = EVENT_COMANDA_BATCH_STATUS_LABELS[option]

        if (!interactive) {
          return (
            <span
              key={option}
              className={cn(
                corporateFilterBadgeBaseClass,
                active
                  ? cn(eventComandaBatchStatusBadgeClass(option), 'shadow-sm')
                  : 'border-transparent bg-transparent px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-400 opacity-50'
              )}
              aria-current={active ? 'step' : undefined}
            >
              {label}
            </span>
          )
        }

        return (
          <button
            key={option}
            type="button"
            disabled={saving || active}
            onClick={() => onSelect?.(option)}
            className={cn(
              corporateFilterBadgeBaseClass,
              'touch-manipulation',
              active
                ? cn(eventComandaBatchStatusBadgeClass(option), 'shadow-sm ring-2 ring-offset-1 ring-slate-300/80')
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              saving && !active && 'pointer-events-none opacity-50'
            )}
            aria-pressed={active}
            aria-label={`Marcar com a ${label}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
