'use client'

import { Ban, CheckCircle2 } from 'lucide-react'
import type { PreparationWarehouseCompletionMap } from '@/lib/logistics/prepTypes'
import { normalizePreparationWarehouseMap } from '@/lib/logistics/preparationMagatzem'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { cn } from '@/lib/utils'

export type AllowedPreparationWarehouse = {
  code: PreparationWarehouseCode
  label: string
}

export type PreparationWarehouseState = 'pending' | 'prepared' | 'not_applicable'

type ToggleHandler = (
  rowId: string,
  warehouse: PreparationWarehouseCode,
  state: PreparationWarehouseState,
  reason?: string
) => void

function notApplicableAuditTitle(entry: { reason?: string; userName?: string; at?: string }) {
  const when = entry.at
    ? new Date(entry.at).toLocaleString('ca-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  return [entry.reason || 'No aplica', entry.userName, when].filter(Boolean).join(' · ')
}

export default function PreparationWarehouseToggles({
  rowId,
  completionMap,
  allowedWarehouses,
  onToggle,
  canMarkNotApplicable = false,
  readOnly = false,
}: {
  rowId: string
  completionMap?: PreparationWarehouseCompletionMap
  allowedWarehouses: AllowedPreparationWarehouse[]
  onToggle?: ToggleHandler
  canMarkNotApplicable?: boolean
  readOnly?: boolean
}) {
  const map = normalizePreparationWarehouseMap(completionMap)

  if (!allowedWarehouses.length) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {allowedWarehouses.map(({ code, label }) => {
        const entry = map[code]
        const notApplicable = entry?.status === 'not_applicable'
        const done = Boolean(entry?.at) && !notApplicable

        if (readOnly) {
          return (
            <span
              key={`${rowId}-${code}`}
              title={notApplicable && entry ? notApplicableAuditTitle(entry) : undefined}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                notApplicable
                  ? 'bg-sky-100 text-sky-800'
                  : done
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
              )}
            >
              {label}
              {notApplicable ? ' · N/A' : done ? ' ✓' : ''}
            </span>
          )
        }

        if (notApplicable) {
          const content = (
            <>
              <Ban className="h-3 w-3" />
              {label} · N/A
            </>
          )

          return canMarkNotApplicable ? (
            <button
              key={`${rowId}-${code}`}
              type="button"
              title={`${entry ? notApplicableAuditTitle(entry) : 'No aplica'} · Clica per retirar-ho`}
              onClick={() => {
                if (window.confirm(`Vols retirar el No aplica de ${label}?`)) {
                  onToggle?.(rowId, code, 'pending')
                }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white transition hover:bg-sky-700"
            >
              {content}
            </button>
          ) : (
            <span
              key={`${rowId}-${code}`}
              title={entry ? notApplicableAuditTitle(entry) : 'No aplica'}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-800"
            >
              {content}
            </span>
          )
        }

        return (
          <span key={`${rowId}-${code}`} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggle?.(rowId, code, done ? 'pending' : 'prepared')}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition',
                done
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-800'
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              {label}
            </button>
            {canMarkNotApplicable ? (
              <button
                type="button"
                aria-label={`Marcar ${label} com a No aplica`}
                title={`Marcar ${label} com a No aplica`}
                onClick={() => {
                  const reason = window.prompt(`Motiu pel qual ${label} no aplica:`)?.trim()
                  if (reason) onToggle?.(rowId, code, 'not_applicable', reason)
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700 transition hover:bg-sky-200"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
