'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ComandaLineSortDirection, ComandaLineSortKey, ComandaLineSortSpec } from '@/lib/eventComanda/sortLines'
import { eventComandaTableHeadCellClass } from '@/lib/eventComanda/ui'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  sortKey: ComandaLineSortKey
  sortStack: ComandaLineSortSpec[]
  onSort: (key: ComandaLineSortKey) => void
  align?: 'left' | 'right'
  className?: string
}

export default function EventComandaSortableTh({
  label,
  sortKey,
  sortStack,
  onSort,
  align = 'left',
  className,
}: Props) {
  const rank = sortStack.findIndex((entry) => entry.key === sortKey)
  const active = rank >= 0
  const direction: ComandaLineSortDirection =
    rank >= 0 ? sortStack[rank].direction : 'asc'
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <th className={cn(eventComandaTableHeadCellClass, align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={
          active && rank === 1
            ? 'Segon criteri d\'ordenació. Clic per fer-lo principal.'
            : active
              ? 'Clic per invertir l\'ordre. Clic en una altra columna combina criteris.'
              : 'Clic per ordenar. Es pot combinar amb una altra columna.'
        }
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-left transition hover:text-slate-800',
          align === 'right' && 'ml-auto',
          active ? 'text-slate-900' : 'text-slate-500'
        )}
        aria-label={`Ordenar per ${label}`}
        aria-pressed={active}
      >
        <span>{label}</span>
        {active && rank === 1 ? (
          <span className="rounded-full bg-slate-200 px-1 text-[9px] font-bold leading-none text-slate-600">
            2
          </span>
        ) : null}
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            active ? (rank === 0 ? 'text-slate-700' : 'text-slate-500') : 'text-slate-400'
          )}
        />
      </button>
    </th>
  )
}
