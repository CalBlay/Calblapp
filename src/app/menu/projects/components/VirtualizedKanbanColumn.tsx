'use client'

import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export const KANBAN_VIRTUAL_THRESHOLD = 24
const DEFAULT_ROW_PX = 196
const COLUMN_MAX_HEIGHT = 'min(72vh, 820px)'

type Props<T> = {
  items: T[]
  getItemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  estimateSize?: number
  threshold?: number
  className?: string
}

export default function VirtualizedKanbanColumn<T>({
  items,
  getItemKey,
  renderItem,
  estimateSize = DEFAULT_ROW_PX,
  threshold = KANBAN_VIRTUAL_THRESHOLD,
  className = 'mt-4 space-y-3',
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = items.length >= threshold

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
    getItemKey: (index) => getItemKey(items[index], index),
  })

  if (!shouldVirtualize) {
    return (
      <div className={className.includes('space-y-') ? className : `${className} space-y-3`}>
        {items.map((item, index) => renderItem(item, index))}
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className={`${className} max-h-[${COLUMN_MAX_HEIGHT}] overflow-y-auto pr-1`}
      style={{ maxHeight: COLUMN_MAX_HEIGHT }}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
