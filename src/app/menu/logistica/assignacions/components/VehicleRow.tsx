'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Save, Pencil, Trash2, Loader2 } from 'lucide-react'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportPlateKey,
} from '@/lib/transportTypes'
import { parsePendingAssignacionsRowId } from '@/lib/transportAssignacionsRowSlot'
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
  quadrantDocId?: string
  conductorIndex?: number
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
  onChanged: () => void | Promise<void>
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
  /** Id de personal (stage / personnel API); obligatori per no deixar el nom nou amb id antic al Firestore. */
  const [driverPersonnelId, setDriverPersonnelId] = useState(() => {
    const rid = row?.id
    if (rid && !String(rid).startsWith('pending:')) return String(rid)
    return ''
  })
  /** Snapshot al carregar la fila (per substituir al Firestore el mateix conductor, no afegir-ne un altre). */
  const [priorName, setPriorName] = useState(() =>
    String(row?.name ?? '').trim()
  )
  const [priorPlate, setPriorPlate] = useState(() =>
    String(
      row?.plate ?? row?.matricula ?? row?.vehiclePlate ?? ''
    ).trim()
  )

  const [isEditing, setIsEditing] = useState<boolean>(isNew)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Sync when row arrives async
  useEffect(() => {
    if (!row) return
    setDriverName(row.name ?? '')
    setPriorName(String(row.name ?? '').trim())
    if (row.department) setDepartment(row.department)
    setDate(row.startDate ?? '')
    setStartTime(toTime5(row.startTime ?? ''))
    setArrivalTime(toTime5(row.arrivalTime ?? ''))
    setEndTime(toTime5(row.endTime ?? ''))
    setVehicleType(row.vehicleType ?? '')
    const p = String(
      row.plate ?? row.matricula ?? row.vehiclePlate ?? ''
    ).trim()
    setPlate(p)
    setPriorPlate(p)
    setDriverPersonnelId(
      row.id && !String(row.id).startsWith('pending:') ? String(row.id) : ''
    )
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
  const { conductors } = useAvailablePersonnel({
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

  /** Conductor assignat actual: sempre opció al desplegable encara que l’API no el retorni (p. ex. canvi només de matrícula / tipus). */
  const driverSelectOptions = useMemo(() => {
    const dn = driverName.trim()
    if (dn && !drivers.some((d) => d.name === dn)) {
      return [{ id: '__assignacions_current__', name: dn }, ...drivers]
    }
    return drivers
  }, [drivers, driverName])

  /** Si el document té nom nou però id antic, quan carrega el llista de conductors posem l’id correcte. */
  useEffect(() => {
    if (!isEditing) return
    const name = String(driverName).trim()
    if (!name) return
    const match = conductors.find((d) => String(d.name).trim() === name)
    if (!match) return
    setDriverPersonnelId((prev) => (prev === match.id ? prev : match.id))
  }, [isEditing, conductors, driverName])

  const syntheticDriverOption = driverSelectOptions.find((d) => d.id === '__assignacions_current__')
  const driverSelectValue =
    driverPersonnelId ||
    (syntheticDriverOption && syntheticDriverOption.name === driverName.trim()
      ? '__assignacions_current__'
      : '')

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

  /** Matrícula ja assignada: opció vàlida encara que no surti com a “disponible” (mateix conductor, altre vehicle). */
  const plateSelectOptions = useMemo((): AvailableVehicle[] => {
    if (!vehicleType) return plateOptions
    const p = plate.trim()
    if (!p) return plateOptions
    const key = normalizeTransportPlateKey(p)
    const already = plateOptions.some(
      (v) =>
        v.type === vehicleType &&
        normalizeTransportPlateKey(v.plate) === key
    )
    if (already) return plateOptions
    return [
      {
        id: `__assignacions_current_plate__`,
        plate: p,
        type: vehicleType,
        available: true,
      },
      ...plateOptions,
    ]
  }, [plateOptions, plate, vehicleType])

  const handleSave = async () => {
    try {
      setSaveError(null)
      setSaving(true)

      if (vehicleType && !driverName.trim()) {
        setSaveError('Indica el conductor (o conserva l’assignat al desplegable).')
        return
      }

      if (vehicleType && !plate.trim()) {
        setSaveError('Selecciona una matrícula per desar el vehicle.')
        return
      }

      let personnelId = String(driverPersonnelId || '').trim()
      if (
        vehicleType &&
        driverName.trim() &&
        (!personnelId || personnelId === '__assignacions_current__')
      ) {
        const m = conductors.find((d) => String(d.name).trim() === driverName.trim())
        if (m) personnelId = m.id
      }
      if (personnelId === '__assignacions_current__') personnelId = ''

      const fromPending = parsePendingAssignacionsRowId(row?.id)
      const quadrantDocIdPayload = row?.quadrantDocId ?? fromPending?.quadrantDocId
      const conductorIndexPayload =
        row?.conductorIndex != null ? row.conductorIndex : fromPending?.conductorIndex

      const savingNewRow = Boolean(isNew || !row?.id)

      const payload = {
        eventCode,
        department,
        isNew: savingNewRow,
        rowId: row?.id,
        rowIndex,
        quadrantDocId: quadrantDocIdPayload,
        conductorIndex: conductorIndexPayload,
        originalPlate,
        priorConductor:
          !savingNewRow && row
            ? { name: priorName, plate: priorPlate }
            : undefined,
        data: {
          ...(personnelId ? { id: personnelId } : {}),
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
        const text = await res.text()
        let msg = text || 'Error desant'
        try {
          const j = JSON.parse(text) as { error?: string }
          if (j?.error) msg = j.error
        } catch {
          /* cos en text pla */
        }
        setSaveError(msg)
        return
      }

      invalidateAvailableVehiclesCache()
      invalidateAvailablePersonnelCache()
      setIsEditing(false)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('quadrant:updated'))
      }
      await Promise.resolve(onChanged())
    } catch {
      setSaveError('Error inesperat')
    } finally {
      setSaving(false)
    }
  }

  const deleteSlot = parsePendingAssignacionsRowId(row?.id)
  const deleteQuadrantDocId = row?.quadrantDocId ?? deleteSlot?.quadrantDocId

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
        quadrantDocId: deleteQuadrantDocId,
        conductorIndex:
          row.conductorIndex != null ? row.conductorIndex : deleteSlot?.conductorIndex,
      }),
    })

    invalidateAvailableVehiclesCache()
    invalidateAvailablePersonnelCache()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('quadrant:updated'))
    }
    await Promise.resolve(onChanged())
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
            {plateSelectOptions.map((v) => (
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
              value={driverSelectValue}
              onChange={(e) => {
                const v = e.target.value
                if (!v) {
                  setDriverPersonnelId('')
                  setDriverName('')
                  return
                }
                if (v === '__assignacions_current__') {
                  setDriverPersonnelId('')
                  setDriverName(syntheticDriverOption?.name ?? '')
                  return
                }
                const opt = driverSelectOptions.find((d) => d.id === v)
                if (opt) {
                  setDriverPersonnelId(opt.id)
                  setDriverName(opt.name)
                }
              }}
              disabled={!effectiveVehicleType}
            >
              <option value="">
                {effectiveVehicleType ? 'Selecciona conductor' : 'Primer tria el tipus de vehicle'}
              </option>
              {driverSelectOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.id === '__assignacions_current__' ? ' (assignat)' : ''}
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
