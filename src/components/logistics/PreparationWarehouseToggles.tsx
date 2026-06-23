'use client'

import { CheckCircle2 } from 'lucide-react'
import type { PreparationWarehouseCompletionMap } from '@/lib/logistics/prepTypes'
import { normalizePreparationWarehouseMap } from '@/lib/logistics/preparationMagatzem'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { cn } from '@/lib/utils'

export type AllowedPreparationWarehouse = {
  code: PreparationWarehouseCode
  label: string
}

export default function PreparationWarehouseToggles({
  rowId,
  completionMap,
  allowedWarehouses,
  onToggle,
  readOnly = false,
}: {
  rowId: string
  completionMap?: PreparationWarehouseCompletionMap
  allowedWarehouses: AllowedPreparationWarehouse[]
  onToggle?: (rowId: string, warehouse: PreparationWarehouseCode, done: boolean) => void
  readOnly?: boolean
}) {
  const map = normalizePreparationWarehouseMap(completionMap)

  if (!allowedWarehouses.length) {
    return <span className="text-[11px] text-slate-400">Sense magatzems assignats</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {allowedWarehouses.map(({ code, label }) => {
        const done = Boolean(map[code]?.at)
        if (readOnly) {
          return (
            <span
              key={`${rowId}-${code}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
              )}
            >
              {label}
              {done ? ' ✓' : ''}
            </span>
          )
        }

        return (
          <button
            key={`${rowId}-${code}`}
            type="button"
            onClick={() => onToggle?.(rowId, code, !done)}
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
        )
      })}
    </div>
  )
}
