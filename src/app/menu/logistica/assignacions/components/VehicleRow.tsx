'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Save, Pencil, Trash2, Loader2 } from 'lucide-react'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportPlateKey,
} from '@/lib/transportTypes'
import {
  invalidateAvailablePersonnelCache,
  useAvailablePersonnel,
} from '@/hooks/logistics/useAvailablePersonnel'
import {
  invalidateAvailableVehiclesCache,
  useAvailableVehicles,
  type AvailableVehicle,
} from '@/hooks/logistics/useAvailableVehicles'

type Driver = { id: string; name: string }
type AssignmentVehicleRow = {
  id?: string
  department?: string
  name?: string
  plate?: string
  matricula?: string
  vehiclePlate?: string
  vehicleType?: string
  startDate?: string
  arrivalTime?: string
  endTime?: string
  startTime?: string
}

interface Props {
  eventCode: string
  expectedVehicleType?: string
  row: AssignmentVehicleRow | null
  rowIndex?: number
  eventDay: string
  eventStartTime: string
  eventEndTime: string
  onChanged: () => void
  isNew: boolean
  rowKey: string
  onEditingChange?: (rowKey: string, isEditing: boolean) => void
}

/** Alineat amb GET /api/transports/assignacions: només Logística i Cuina tenen aquest flux de conductor. */
const DEPARTMENTS = [
  { value: 'logistica', label: 'Logistica' },
  { value: 'cuina', label: 'Cuina' },
] as const

const toTime5 = (t?: string) => (t ? String(t).slice(0, 5) : '')

export default function VehicleRow({
  eventCode,
  expectedVehicleType,
  row,
  rowIndex,
  eventDay,
  eventStartTime,
  eventEndTime,
  onChanged,
  isNew,
  rowKey,
  onEditingChange,
}: Props) {
  const [department, setDepartment] = useState(
    (row?.department || 'logistica').toString().toLowerCase()
  )
  const [date, setDate] = useState((row?.startDate ?? eventDay ?? '').toString())
  const [startTime, setStartTime] = useState(
    toTime5(row?.startTime ?? eventStartTime ?? '')
  )
  const [arrivalTime, setArrivalTime] = useState(
    toTime5(row?.arrivalTime ?? eventStartTime ?? '')
  )
  const [endTime, setEndTime] = useState(
    toTime5(row?.endTime ?? eventEndTime ?? '')
  )
  const [vehicleType, setVehicleType] = useState(
    (row?.vehicleType ?? expectedVehicleType ?? '').toString()
  )

  const normalizedPlate =
    row?.plate ||
    row?.matricula ||
    row?.vehiclePlate ||
    ''
  const originalPlate = normalizedPlate.toString()

  const [plate, setPlate] = useState(normalizedPlate.toString())
  const [driverName, setDriverName] = useState((row?.name || '').toString())

  const [isEditing, setIsEditing] = useState<boolean>(isNew)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Sync when row arrives async
  useEffect(() => {
    if (!row) return
    setDriverName(row.name ?? '')
    if (row.department) setDepartment(row.department)
    setDate(row.startDate ?? '')
    setStartTime(toTime5(row.startTime ?? ''))
    setArrivalTime(toTime5(row.arrivalTime ?? ''))
    setEndTime(toTime5(row.endTime ?? ''))
    setVehicleType(row.vehicleType ?? '')
    setPlate(row.plate ?? row.matricula ?? row.vehiclePlate ?? '')
  }, [row])

  useEffect(() => {
    if (onEditingChange) onEditingChange(rowKey, isEditing)
  }, [isEditing, onEditingChange, rowKey])

  useEffect(() => {
    return () => {
      if (onEditingChange) onEditingChange(rowKey, false)
    }
  }, [onEditingChange, rowKey])

  const canLoadVehicles = Boolean(date && startTime)
  const effectiveVehicleType = (vehicleType || row?.vehicleType || '').toString().trim()
  const { conductors, loading: driversLoading } = useAvailablePersonnel({
    departament: department,
    startDate: date,
    startTime,
    endDate: date,
    endTime: endTime || startTime,
    vehicleType: effectiveVehicleType || undefined,
    enabled: isEditing && Boolean(date && startTime && effectiveVehicleType),
  })
  const drivers: Driver[] = useMemo(
    () => conductors.map((driver) => ({ id: driver.id, name: driver.name })),
    [conductors]
  )

  useEffect(() => {
    if (!isEditing || driversLoading || !driverName.trim()) return
    if (!effectiveVehicleType) return
    if (drivers.some((d) => d.name === driverName)) return
    setDriverName('')
  }, [isEditing, driversLoading, drivers, driverName, effectiveVehicleType])

  const { vehicles: availableVehicles, loading: loadingVehicles } = useAvailableVehicles({
    startDate: date,
    startTime,
    endDate: date,
    endTime: endTime || startTime,
    enabled: canLoadVehicles,
  })

  useEffect(() => {
    if (!isEditing || loadingVehicles || !vehicleType || !plate.trim()) return
    const key = normalizeTransportPlateKey(plate)
    const rowMatch = availableVehicles.find(
      (v) => v.type === vehicleType && normalizeTransportPlateKey(v.plate) === key
    )
    if (rowMatch && rowMatch.available === false) {
      setPlate('')
    }
  }, [isEditing, loadingVehicles, vehicleType, plate, availableVehicles])

  const plateOptions = useMemo(() => {
    if (!vehicleType) return []

    return availableVehicles.filter(
      (v) => v.type === vehicleType && v.available === true
    )
  }, [availableVehicles, vehicleType])

  const handleSave = async () => {
    try {
      setSaveError(null)
      setSaving(true)

      const payload = {
        eventCode,
        department,
        isNew: isNew || !row?.id,
        rowId: row?.id,
        rowIndex,
        originalPlate,
        data: {
          name: driverName,
          plate,
          vehicleType,
          startDate: date,
          endDate: date,
          startTime,
          arrivalTime,
          endTime,
        },
      }

      const res = await fetch('/api/transports/assignacions/row/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const txt = await res.text()
        setSaveError(txt || 'Error desant')
        return
      }

      invalidateAvailableVehiclesCache()
      invalidateAvailablePersonnelCache()
      setIsEditing(false)
      onChanged()
    } catch {
      setSaveError('Error inesperat')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!row?.id) return
    if (!confirm('Vols eliminar aquest vehicle?')) return

    await fetch('/api/transports/assignacions/row/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventCode,
        department,
        rowId: row.id,
      }),
    })

    invalidateAvailableVehiclesCache()
    invalidateAvailablePersonnelCache()
    onChanged()
  }

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[140px_120px_80px_90px_80px_140px_140px_minmax(160px,1fr)_96px] lg:items-end lg:gap-2">
        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Departament</label>
          <select
            aria-label="Departament"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={!isEditing}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Dia</label>
          <input
            type="date"
            aria-label="Dia"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!isEditing}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Sortida</label>
          <input
            type="time"
            aria-label="Sortida"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={!isEditing}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Arribada desti</label>
          <input
            type="time"
            aria-label="Arribada desti"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            disabled={!isEditing}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Tornada</label>
          <input
            type="time"
            aria-label="Tornada"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={!isEditing}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Vehicle</label>
          <select
            aria-label="Vehicle"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={vehicleType}
            onChange={(e) => {
              setVehicleType(e.target.value)
              setPlate('')
              setDriverName('')
            }}
            disabled={!isEditing || !canLoadVehicles}
          >
            <option value="">Selecciona vehicle</option>
            {TRANSPORT_TYPE_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Matricula</label>
          <select
            aria-label="Matricula"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 lg:mt-0"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            disabled={!isEditing || !vehicleType || loadingVehicles}
          >
            <option value="">Selecciona matricula</option>
            {plateOptions.map((v) => (
              <option key={v.id} value={v.plate}>
                {v.plate} {v.type ? `- ${TRANSPORT_TYPE_LABELS[v.type] || v.type}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 lg:sr-only">Conductor</label>
          {isEditing ? (
            <select
              aria-label="Conductor"
              className={`mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100 ${
                !driverName ? 'border-amber-400 bg-amber-50' : ''
              } lg:mt-0`}
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              disabled={driversLoading || !effectiveVehicleType}
            >
              <option value="">
                {effectiveVehicleType ? 'Selecciona conductor' : 'Primer tria el tipus de vehicle'}
              </option>
              {drivers.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="mt-1 w-full rounded border border-transparent px-2 py-1 text-sm text-slate-800 lg:mt-0"
              aria-label="Conductor"
            >
              {driverName.trim() || '—'}
            </div>
          )}
        </div>

        <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-1 lg:items-center lg:justify-end">
          {!isEditing ? (
            <Button
              size="icon"
              onClick={() => setIsEditing(true)}
              className="border bg-slate-100 text-slate-700 hover:bg-slate-200"
              title="Editar vehicle"
            >
              <Pencil size={16} />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              title="Desar"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            </Button>
          )}

          <Button
            size="icon"
            variant="destructive"
            onClick={handleDelete}
            title="Eliminar"
            disabled={!row?.id}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="mt-2 text-xs text-red-600">
          {saveError}
        </div>
      )}
    </div>
  )
}
