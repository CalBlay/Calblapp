'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatFieldValue } from './mcp-helpers'

export const DOCUMENT_FIELDS_VIRTUAL_THRESHOLD = 36

export function VirtualizedDocumentFields({
  entries,
}: {
  entries: [string, unknown][]
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 6,
  })

  return (
    <div ref={parentRef} className="max-h-[28rem] overflow-auto rounded-lg border">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const [k, v] = entries[vi.index]
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 box-border flex w-full border-b border-slate-200 last:border-0 hover:bg-muted/40"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div className="w-[40%] shrink-0 p-2 align-top font-mono text-xs text-violet-700">
                {k}
              </div>
              <div className="min-w-0 flex-1 whitespace-pre-wrap break-words p-2 align-top text-sm">
                {formatFieldValue(v)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
