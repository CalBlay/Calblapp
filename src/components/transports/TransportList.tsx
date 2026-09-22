//file: src/components/transports/TransportList.tsx
'use client'

import React from 'react'
import { Transport } from '@/hooks/useTransports'
import { usePersonnel } from '@/hooks/usePersonnel'
import { TransportCard } from './TransportCard'
import type { TransportTypeDefinition } from '@/lib/transportTypes'

interface Props {
  transports: Transport[]
  onEdit: (t: Transport) => void
  onDelete: (t: Transport) => void
  transportTypes: TransportTypeDefinition[]
  canEdit: boolean
}

export default function TransportList({
  transports,
  onEdit,
  onDelete,
  transportTypes,
  canEdit,
}: Props) {
  const { data: personnel } = usePersonnel()

  const getDriverName = (id?: string | null) => {
    if (!id || !personnel) return null
    return personnel.find((p) => p.id === id)?.name || null
  }

  if (!transports?.length) {
    return (
      <div className="text-gray-500 italic text-center py-12 text-sm">
        No hi ha transports registrats per als filtres seleccionats.
      </div>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {transports.map((t) => (
        <TransportCard
          key={t.id}
          transport={t}
          transportTypeDefinition={transportTypes.find((type) => type.value === t.type)}
          driverName={getDriverName(t.conductorId)}
          onEdit={() => onEdit(t)}
          onDelete={() => onDelete(t)}
          canEdit={canEdit}
        />
      ))}
    </div>
  )
}
