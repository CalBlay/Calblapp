'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StageEventRow } from './types'

const ROW_PX = 46
const LIST_MAX_H = 560

/** A partir d’aquest nombre de files es virtualitza el cos de la llista (menys nodes DOM). */
export const STAGE_EVENT_VIRTUAL_THRESHOLD = 24

export function VirtualizedStageEventRows({ rows }: { rows: StageEventRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_PX,
    overscan: 10,
  })

  return (
    <div
      ref={parentRef}
      className="max-h-[min(var(--mcp-list-max-h),70vh)] overflow-auto"
      style={{ ['--mcp-list-max-h' as string]: `${LIST_MAX_H}px` }}
    >
      <div
        className="relative w-full min-w-[44rem]"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const r = rows[vi.index]
          return (
            <div
              key={vi.key}
              className="absolute left-0 top-0 box-border grid w-full grid-cols-[6rem_minmax(10rem,1fr)_5.5rem_3rem_7rem_3.5rem] items-center gap-0 border-b border-slate-100 px-2 py-1.5 text-sm last:border-0 hover:bg-muted/30"
              style={{
                height: `${vi.size}px`,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <div className="whitespace-nowrap pr-1">{r.DataInici ?? '—'}</div>
              <div className="min-w-0 truncate pr-1" title={r.NomEvent}>
                {r.NomEvent ?? '—'}
              </div>
              <div className="font-mono text-xs pr-1">{r.code ?? '—'}</div>
              <div className="pr-1">{r.NumPax ?? '—'}</div>
              <div className="max-w-[7rem] truncate pr-1" title={r.Ubicacio}>
                {r.Ubicacio ?? '—'}
              </div>
              <div className="truncate">{r.LN ?? '—'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
