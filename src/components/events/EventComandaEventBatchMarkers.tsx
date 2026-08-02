'use client'

import {
  AlertTriangle,
  CircleCheck,
  ClipboardList,
  Package,
  Truck,
} from 'lucide-react'
import {
  EVENT_COMANDA_BATCH_STATUS_BADGES,
  EVENT_COMANDA_BATCH_STATUS_LABELS,
} from '@/lib/eventComanda/batchStatus'
import type {
  EventComandaBatchStatus,
  WarehouseComandaEventBatchChip,
} from '@/lib/eventComanda/types'
import { corporateFilterBadgeBaseClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

const STATUS_ICONS: Record<EventComandaBatchStatus, typeof ClipboardList> = {
  pending: ClipboardList,
  in_progress: Package,
  ready: CircleCheck,
  sent: Truck,
  issue: AlertTriangle,
  cancelled: ClipboardList,
}

function warehouseShortLabel(batch: WarehouseComandaEventBatchChip) {
  const raw = String(batch.warehouseCode || batch.warehouseName || batch.warehouseId || '').trim()
  if (!raw) return 'Mag'
  const firstWord = raw.split(/\s+/)[0] || raw
  return firstWord.length > 5 ? firstWord.slice(0, 5) : firstWord
}

type Props = {
  batches?: WarehouseComandaEventBatchChip[] | null
  className?: string
}

export default function EventComandaEventBatchMarkers({ batches, className }: Props) {
  if (!batches?.length) return null

  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-1', className)}
      role="status"
      aria-label="Estat de la comanda al magatzem"
    >
      {batches.map((batch) => {
        const Icon = STATUS_ICONS[batch.status] || ClipboardList
        const statusLabel = EVENT_COMANDA_BATCH_STATUS_LABELS[batch.status]
        const warehouseLabel = String(
          batch.warehouseName || batch.warehouseCode || batch.warehouseId
        ).trim()

        return (
          <span
            key={batch.batchId}
            title={`${warehouseLabel} · ${statusLabel}`}
            className={cn(
              corporateFilterBadgeBaseClass,
              'inline-flex h-7 max-w-full items-center gap-1 px-2 text-[10px] font-bold normal-case tracking-normal',
              EVENT_COMANDA_BATCH_STATUS_BADGES[batch.status],
              'shadow-sm'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{warehouseShortLabel(batch)}</span>
            <span className="sr-only">{statusLabel}</span>
          </span>
        )
      })}
    </div>
  )
}
