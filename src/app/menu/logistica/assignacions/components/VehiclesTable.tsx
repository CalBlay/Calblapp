'use client'

import React, { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import VehicleRow from './VehicleRow'
import type { TransportAssignmentItem } from '../hooks/useTransportAssignments'

interface Props {
  item: TransportAssignmentItem
  onChanged: () => void
  onEditingChange?: (rowKey: string, isEditing: boolean) => void
}

export default function VehiclesTable({ item, onChanged, onEditingChange }: Props) {
  const existingRows = useMemo(
    () => (Array.isArray(item.rows) ? item.rows : []),
    [item.rows]
  )

  const [newRows, setNewRows] = useState<number[]>([])

  const handleAdd = () => {
    setNewRows((prev) => [...prev, Date.now()])
  }

  const handleSavedNewRow = () => {
    setNewRows([])
    onChanged()
  }

  return (
    <div className="space-y-2 p-3">
      <div className="hidden lg:grid lg:grid-cols-[140px_120px_80px_90px_80px_140px_140px_minmax(160px,1fr)_96px] lg:gap-2 lg:px-3 lg:text-xs lg:font-semibold lg:text-gray-500">
        <div>Departament</div>
        <div>Dia</div>
        <div>Sortida</div>
        <div>Arribada desti</div>
        <div>Tornada</div>
        <div>Vehicle</div>
        <div>Matricula</div>
        <div>Conductor</div>
        <div className="text-right">Accions</div>
      </div>

      {existingRows.map((row, idx) => (
        <VehicleRow
          key={row.id}
          rowKey={String(row?.id || `row-${idx}`)}
          rowIndex={idx}
          eventCode={item.eventCode}
          row={row}
          isNew={false}
          eventDay={item.day}
          eventStartTime={item.eventStartTime}
          eventEndTime={item.eventEndTime}
          onChanged={onChanged}
          onEditingChange={onEditingChange}
        />
      ))}

      {newRows.map((key) => (
        <VehicleRow
          key={`new-${key}`}
          rowKey={`new-${key}`}
          eventCode={item.eventCode}
          row={null}
          isNew={true}
          eventDay={item.day}
          eventStartTime={item.eventStartTime}
          eventEndTime={item.eventEndTime}
          onChanged={handleSavedNewRow}
          onEditingChange={onEditingChange}
        />
      ))}

      <div className="flex justify-center pt-2">
        <Button variant="outline" className="gap-2" onClick={handleAdd}>
          <Plus size={16} />
          Afegir vehicle
        </Button>
      </div>
    </div>
  )
}
