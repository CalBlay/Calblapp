// ✅ file: src/components/logistics/LogisticsCard.tsx
'use client'

import { format } from 'date-fns'
import { ca } from 'date-fns/locale'

interface LogisticsCardProps {
  event: {
    id: string
    DataInici?: string
    NomEvent?: string
    Ubicacio?: string
    PreparacioData?: string
    PreparacioHora?: string
  }
  role: string
  onChangeData?: (id: string, value: string) => void
  onChangeHora?: (id: string, value: string) => void
}

export default function LogisticsCard({ event, role, onChangeData, onChangeHora }: LogisticsCardProps) {
  const editable = ['cap', 'direccio', 'admin'].includes(role)
  const dataInici = event.DataInici ? format(new Date(event.DataInici), 'dd/MM/yyyy', { locale: ca }) : '-'

  return (
    <tr className="border-t align-top hover:bg-gray-50 transition-colors">
      <td className="p-2 text-left font-medium sticky left-0 bg-white border-r shadow-sm">
        {dataInici}
      </td>
      <td className="p-2">{event.NomEvent}</td>
      <td className="p-2">{event.Ubicacio}</td>
      <td className="p-2">
        {editable ? (
          <input
            type="date"
            value={event.PreparacioData || ''}
            onChange={(e) => onChangeData?.(event.id, e.target.value)}
            className="border rounded p-1 w-full text-xs"
          />
        ) : (
          <span>
            {event.PreparacioData
              ? format(new Date(event.PreparacioData), 'dd/MM/yyyy', { locale: ca })
              : '-'}
          </span>
        )}
      </td>
      <td className="p-2">
        {editable ? (
          <input
            type="time"
            value={event.PreparacioHora || ''}
            onChange={(e) => onChangeHora?.(event.id, e.target.value)}
            className="border rounded p-1 w-full text-xs"
          />
        ) : (
          <span>{event.PreparacioHora || '-'}</span>
        )}
      </td>
    </tr>
  )
}
