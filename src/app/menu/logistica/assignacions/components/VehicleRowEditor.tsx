'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
} from '@/lib/transportTypes'
import {
  invalidateAvailableVehiclesCache,
  useAvailableVehicles,
} from '@/hooks/logistics/useAvailableVehicles'
import { invalidateAvailablePersonnelCache } from '@/hooks/logistics/useAvailablePersonnel'

type DepartmentOption = 'logistica' | 'serveis'
type Driver = {
  id: string
  name: string
}

type Props = {
  eventCode: string
  eventDay: string
  eventStartTime: string
  eventEndTime: string
  onSaved: () => void
  onCancel: () => void
}

export default function VehicleRowEditor({
  eventCode,
  eventDay,
  eventStartTime,
  eventEndTime,
  onSaved,
  onCancel,
}: Props) {
  const [department, setDepartment] = useState<DepartmentOption>('logistica')
  const [vehicleType, setVehicleType] = useState('')
  const [plate, setPlate] = useState('')
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState(eventDay)
  const [startTime, setStartTime] = useState(eventStartTime)
  const [endTime, setEndTime] = useState(eventEndTime)
  const [drivers, setDrivers] = useState<Driver[]>([])

  useEffect(() => {
    async function loadDrivers() {
      const res = await fetch(`/api/personnel/by-department?dept=${department}`)
      if (!res.ok) return setDrivers([])
      const data = await res.json()
      setDrivers(
        Array.isArray(data.items)
          ? data.items
              .filter(
                (item: unknown): item is Driver =>
                  typeof item === 'object' &&
                  item !== null &&
                  typeof (item as Driver).id === 'string' &&
                  typeof (item as Driver).name === 'string'
              )
          : []
      )
    }
    loadDrivers()
  }, [department])

  const { vehicles, loading: loadingVehicles } = useAvailableVehicles({
    startDate: date,
    startTime,
    endDate: date,
    endTime,
    enabled: Boolean(startTime && endTime),
  })

  const plateOptions = useMemo(() => {
    return vehicles.filter(
      (v) => v.available === true && (!vehicleType || v.type === vehicleType)
    )
  }, [vehicles, vehicleType])

  const handleSave = async () => {
    if (!vehicleType || !plate || !driverId) return

    await fetch('/api/transports/assignacions/row/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventCode,
        payload: {
          department,
          vehicleType,
          plate,
          driverId,
          startDate: date,
          endDate: date,
          startTime,
          endTime,
        },
      }),
    })

    invalidateAvailableVehiclesCache()
    invalidateAvailablePersonnelCache()
    onSaved()
  }

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-xl border bg-emerald-50 p-3 md:grid-cols-[120px_160px_160px_200px_140px_90px_90px_96px]">
      <select
        className="rounded border px-2 py-1 text-sm"
        value={department}
        onChange={(e) => setDepartment(e.target.value as DepartmentOption)}
      >
        <option value="logistica">Logistica</option>
        <option value="serveis">Serveis</option>
      </select>

      <select
        className="rounded border px-2 py-1 text-sm"
        value={plate}
        onChange={(e) => setPlate(e.target.value)}
        disabled={loadingVehicles}
      >
        <option value="">- Matricula -</option>
        {plateOptions.map((v) => (
          <option key={v.id} value={v.plate}>
            {v.plate} {v.type ? `- ${TRANSPORT_TYPE_LABELS[v.type] || v.type}` : ''}
          </option>
        ))}
      </select>

      <select
        className="rounded border px-2 py-1 text-sm"
        value={vehicleType}
        onChange={(e) => {
          setVehicleType(e.target.value)
          setPlate('')
        }}
      >
        <option value="">- Vehicle -</option>
        {TRANSPORT_TYPE_OPTIONS.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>

      <select
        className="rounded border px-2 py-1 text-sm"
        value={driverId}
        onChange={(e) => setDriverId(e.target.value)}
      >
        <option value="">- Nom conductor -</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <input
        type="date"
        className="rounded border px-2 py-1 text-sm"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <input
        type="time"
        className="rounded border px-2 py-1 text-sm"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
      />

      <input
        type="time"
        className="rounded border px-2 py-1 text-sm"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
      />

      <div className="flex justify-end gap-2">
        <Button size="icon" className="bg-green-600 hover:bg-green-700" onClick={handleSave}>
          <Save size={16} />
        </Button>
        <Button size="icon" variant="destructive" onClick={onCancel}>
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  )
}
