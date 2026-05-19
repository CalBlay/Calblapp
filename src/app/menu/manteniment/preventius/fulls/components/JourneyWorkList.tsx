'use client'

import { format, parseISO } from 'date-fns'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'
import type { Transport } from '@/hooks/useTransports'
import type { WorkItem } from '../lib/types'
import JourneyWorkListItem from './JourneyWorkListItem'

type Props = {
  grouped: Array<[string, WorkItem[]]>
  transportById: Map<string, Transport>
  onOpenTicket: (id: string, code?: string, ticketType?: 'maquinaria' | 'deco') => void
  onOpenFitxa: (id: string, recordId?: string | null) => void
}

function buildVehicleLabel(item: WorkItem, transportById: Map<string, Transport>): string {
  const vehicleId = item.vehicleId ? String(item.vehicleId) : ''
  const transport = vehicleId ? transportById.get(vehicleId) : undefined
  const plate = String(item.vehiclePlate || '').trim()
  if (!transport && !plate) return ''
  const typeLabel = transport?.type
    ? TRANSPORT_TYPE_LABELS[String(transport.type)] || String(transport.type)
    : ''
  return [typeLabel, plate].filter(Boolean).join(' · ')
}

export default function JourneyWorkList({ grouped, transportById, onOpenTicket, onOpenFitxa }: Props) {
  if (grouped.length === 0) {
    return <div className="px-4 py-6 text-sm text-gray-500">No hi ha tasques.</div>
  }

  return (
    <>
      {grouped.map(([day, items]) => (
        <div key={day}>
          <div className="sticky top-0 z-[1] bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
            {format(parseISO(day), 'dd/MM/yyyy')}
          </div>
          <div className="divide-y">
            {items.map((item) => (
              <JourneyWorkListItem
                key={item.id}
                item={item}
                vehicleLabel={buildVehicleLabel(item, transportById)}
                onOpenTicket={onOpenTicket}
                onOpenFitxa={onOpenFitxa}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
