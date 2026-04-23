'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ChatReportTable } from './types'

const ROW_PX = 40

export const REPORT_TABLE_VIRTUAL_THRESHOLD = 32

export function VirtualizedReportTable({ table }: { table: ChatReportTable }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const { columns, rows } = table
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_PX,
    overscan: 12,
  })

  const gridTemplate =
    columns.length > 0 ?
      columns.map(() => 'minmax(4rem,1fr)').join(' ')
    : '1fr'

  return (
    <>
      <div
        className="grid gap-0 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-700"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => (
          <div key={c} className="min-w-0 text-left">
            {c}
          </div>
        ))}
      </div>
      <div
        ref={parentRef}
        className="max-h-[min(420px,55vh)] overflow-auto"
      >
        <div
          className="relative min-w-[20rem]"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index]
            return (
              <div
                key={vi.key}
                className="absolute left-0 top-0 box-border grid w-full gap-0 border-b border-slate-100 px-3 py-1.5 text-sm last:border-0"
                style={{
                  gridTemplateColumns: gridTemplate,
                  height: `${vi.size}px`,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {columns.map((_, ci) => (
                  <div key={ci} className="min-w-0 text-slate-800">
                    <span className="line-clamp-3" title={String(row[ci] ?? '')}>
                      {row[ci] ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
