'use client'

import {
  getStatusLabel,
  normalizeMaintenanceStatus,
  PROGRESS_VISIBLE_STATUSES,
  STATUS_CLASSES,
} from '../lib/status'
import type { PreventiuPlannedItem, TicketJourneyItem, WorkItem } from '../lib/types'

type Props = {
  item: WorkItem
  vehicleLabel?: string
  onOpenTicket: (id: string, code?: string, ticketType?: 'maquinaria' | 'deco') => void
  onOpenFitxa: (id: string, recordId?: string | null) => void
}

export default function JourneyWorkListItem({
  item,
  vehicleLabel = '',
  onOpenTicket,
  onOpenFitxa,
}: Props) {
  const isTicket = item.kind === 'ticket'
  const ticketItem = item as TicketJourneyItem
  const preventiuItem = item as PreventiuPlannedItem

  const itemStatus = isTicket
    ? normalizeMaintenanceStatus(ticketItem.status)
    : normalizeMaintenanceStatus(preventiuItem.lastStatus)

  const machineLabel = String(item.machine || '').trim()
  const typeLabel = isTicket ? 'Ticket' : 'Preventiu'

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isTicket
                ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            }`}
          >
            {typeLabel}
          </span>
          <div className="min-w-0 text-base font-semibold text-gray-900">
            {isTicket && ticketItem.code ? `${ticketItem.code} - ${item.title}` : item.title}
          </div>
        </div>
        <div className="mt-2 text-sm font-medium text-gray-700">
          {item.startTime}–{item.endTime}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
          {item.location ? <span>Ubicació: {item.location}</span> : null}
          {machineLabel ? <span>Màquina: {machineLabel}</span> : null}
          {vehicleLabel ? <span>Vehicle: {vehicleLabel}</span> : null}
          {item.hasMedia ? <span>Fotos/Adjunts</span> : null}
          {item.worker ? <span>Operari: {item.worker}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:items-end">
        <span
          className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
            STATUS_CLASSES[itemStatus] || 'bg-slate-100 text-slate-700'
          }`}
        >
          {getStatusLabel(isTicket ? ticketItem.status : preventiuItem.lastStatus, 'assignat')}
          {!isTicket &&
          PROGRESS_VISIBLE_STATUSES.has(itemStatus) &&
          typeof preventiuItem.lastProgress === 'number'
            ? ` · ${preventiuItem.lastProgress}%`
            : ''}
        </span>
        <button
          type="button"
          className="min-h-[48px] w-full rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white touch-manipulation md:w-auto"
          onClick={() =>
            isTicket
              ? onOpenTicket(item.id, ticketItem.code, ticketItem.ticketType)
              : onOpenFitxa(item.id, preventiuItem.lastRecordId || null)
          }
        >
          {isTicket ? 'Obrir ticket' : 'Obrir fitxa'}
        </button>
      </div>
    </div>
  )
}
