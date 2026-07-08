'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import { Truck, User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportPlateKey,
  normalizeTransportType,
} from '@/lib/transportTypes'
import { canDriverHandleVehicleType, type DriverCapability } from '@/lib/driverCapabilities'
import { filterPersonnelAfterLocalQuadrantCheck } from '@/lib/quadrantLocalAvailability'
import { useAvailablePersonnel } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import {
  isPersonReservedForRoleLine,
  normalizeRoleLinePersonKey,
} from '../lib/quadrantPayloadShared'
import type { AvailableVehicle, ServeiGroupRoleLine, ServeiRoleKey, VehicleAssignment } from '../phaseConfig'
import type { ResponsableAvailabilityOption } from '../hooks/useQuadrantFormState'

type PersonOption = {
  id: string
  name: string
  status?: string
  reason?: string
  isDriver?: boolean
  camioPetit?: boolean
  camioGran?: boolean
}

type Props = {
  line: ServeiGroupRoleLine
  assignment: VehicleAssignment
  mode: 'auto' | 'semi' | 'manual'
  responsables: ResponsableAvailabilityOption[]
  conductors: PersonOption[]
  treballadors: PersonOption[]
  reservedPersonIds: Set<string>
  department?: string
  excludeEventId?: string
  availableVehicles: AvailableVehicle[]
  assignedVehicleIds: Set<string>
  canRemove: boolean
  compact?: boolean
  onLinePatch: (patch: Partial<ServeiGroupRoleLine>) => void
  onLineRemove: () => void
  onAssignmentPatch: (patch: Partial<VehicleAssignment>) => void
}

const formatPersonLabel = (person: PersonOption) => {
  if (person.status === 'conflict') {
    return `${person.name} — ocupat${person.reason ? `: ${person.reason}` : ''}`
  }
  if (person.status === 'notfound') return `${person.name} — sense dades`
  return person.name
}

export default function LogisticRoleLineRow({
  line,
  assignment,
  mode,
  responsables: _responsables,
  conductors,
  treballadors,
  reservedPersonIds,
  department,
  excludeEventId,
  availableVehicles,
  assignedVehicleIds,
  canRemove,
  compact = false,
  onLinePatch,
  onLineRemove,
  onAssignmentPatch,
}: Props) {
  const normalize = normalizeRoleLinePersonKey
  const vehicleTypeNorm = normalizeTransportType(assignment.vehicleType)
  const isConductor = line.role === 'conductor'
  const fieldClass = compact ? 'h-8 text-xs' : 'h-9 text-sm'
  const rowStartDate = line.serviceDate || line.startDate || ''
  const rowEndDate = line.endDate || rowStartDate

  const rowAvailabilityEnabled = Boolean(
    department && rowStartDate && line.startTime && line.endTime
  )

  const rowAvailability = useAvailablePersonnel({
    departament: department || '',
    startDate: rowStartDate,
    endDate: rowEndDate,
    startTime: line.startTime,
    endTime: line.endTime,
    excludeEventId,
    vehicleType: isConductor ? assignment.vehicleType : undefined,
    includeConflicts: true,
    enabled: rowAvailabilityEnabled,
  })

  const externalConductors = rowAvailabilityEnabled ? rowAvailability.conductors : conductors
  const externalTreballadors = rowAvailabilityEnabled ? rowAvailability.treballadors : treballadors

  const peoplePool = useMemo(() => {
    const base = isConductor
      ? externalConductors.filter(
          (person) =>
            person.id === line.personId ||
            canDriverHandleVehicleType(person as DriverCapability, vehicleTypeNorm || undefined)
        )
      : externalTreballadors

    return filterPersonnelAfterLocalQuadrantCheck(base, reservedPersonIds, {
      personId: line.personId,
      personName: line.personName,
    })
  }, [
    externalConductors,
    externalTreballadors,
    isConductor,
    line.personId,
    line.personName,
    reservedPersonIds,
    vehicleTypeNorm,
  ])

  const savedPlateKey = normalizeTransportPlateKey(assignment.plate)
  const vehicleMatchedByPlate = useMemo(
    () =>
      savedPlateKey
        ? availableVehicles.find(
            (vehicle) => normalizeTransportPlateKey(vehicle.plate) === savedPlateKey
          ) ?? null
        : null,
    [availableVehicles, savedPlateKey]
  )
  const effectiveVehicleId = assignment.vehicleId || vehicleMatchedByPlate?.id || ''
  const savedPlateSelectValue = savedPlateKey ? `__saved_plate__:${savedPlateKey}` : '__any__'
  const plateSelectValue = effectiveVehicleId || (savedPlateKey ? savedPlateSelectValue : '__any__')

  const filteredVehicles = availableVehicles.filter((vehicle) => {
    if (assignment.vehicleId && assignment.vehicleId === vehicle.id) return true
    if (savedPlateKey && normalizeTransportPlateKey(vehicle.plate) === savedPlateKey) return true
    if (!vehicle.available) return false
    if (vehicleTypeNorm && normalizeTransportType(vehicle.type) !== vehicleTypeNorm) return false
    return !assignedVehicleIds.has(vehicle.id)
  })

  const showSavedPlateFallback =
    Boolean(savedPlateKey) &&
    !effectiveVehicleId &&
    !filteredVehicles.some(
      (vehicle) => normalizeTransportPlateKey(vehicle.plate) === savedPlateKey
    )

  const savedNameValue = line.personName && !line.personId ? `__slot__:${line.slotId}` : ''
  const personValue =
    mode === 'manual' ? line.personId || savedNameValue : line.personId || '__auto__'
  const selectedInPool = line.personId
    ? peoplePool.find((person) => person.id === line.personId)
    : undefined
  const showSavedNameFallback =
    Boolean(String(line.personName || '').trim()) &&
    !selectedInPool &&
    (!line.personId || !peoplePool.some((person) => person.id === line.personId))

  const handleVehicleTypeChange = (nextType: string) => {
    onAssignmentPatch({
      vehicleType: nextType,
      vehicleId: '',
      plate: '',
    })
    if (line.personId) {
      const stillValid = externalConductors.some(
        (person) =>
          person.id === line.personId &&
          canDriverHandleVehicleType(
            person as DriverCapability,
            normalizeTransportType(nextType) || undefined
          )
      )
      if (!stillValid) onLinePatch({ personId: '', personName: '' })
    }
  }

  const handlePlateChange = (value: string) => {
    if (value.startsWith('__saved_plate__:')) return
    if (value === '__any__') {
      onAssignmentPatch({ vehicleId: '', plate: '' })
      return
    }
    const chosen = availableVehicles.find((vehicle) => vehicle.id === value)
    const nextType = normalizeTransportType(chosen?.type || assignment.vehicleType)
    onAssignmentPatch({
      vehicleId: value,
      plate: chosen?.plate || '',
      vehicleType: nextType,
      conductorId: line.personId || chosen?.conductorId || null,
    })
    if (line.personId && nextType) {
      const stillValid = externalConductors.some(
        (person) =>
          person.id === line.personId &&
          canDriverHandleVehicleType(person as DriverCapability, nextType)
      )
      if (!stillValid) onLinePatch({ personId: '', personName: '' })
    }
  }

  const handleRoleChange = (role: ServeiRoleKey) => {
    onLinePatch({
      role,
      personId: '',
      personName: '',
    })
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1.5">
      <div className="flex min-w-max items-center gap-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-slate-200">
          {isConductor ? (
            <Truck className="h-4 w-4 text-orange-500" aria-hidden />
          ) : (
            <User className="h-4 w-4 text-green-600" aria-hidden />
          )}
        </span>

        <select
          value={line.role}
          onChange={(e) => handleRoleChange(e.target.value as ServeiRoleKey)}
          className={`${fieldClass} w-[7.25rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs`}
          aria-label="Rol"
        >
          <option value="conductor">Conductor</option>
          <option value="treballador">Treballador</option>
        </select>

        {isConductor ? (
          <>
            <select
              value={assignment.vehicleType}
              onChange={(e) => handleVehicleTypeChange(e.target.value)}
              className={`${fieldClass} w-[8.5rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs`}
              aria-label="Tipus vehicle"
            >
              <option value="">Tipus…</option>
              {TRANSPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={plateSelectValue}
              onChange={(e) => handlePlateChange(e.target.value)}
              className={`${fieldClass} w-[9rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs`}
              aria-label="Matrícula"
            >
              <option value="__any__">Sense matrícula</option>
              {showSavedPlateFallback ? (
                <option value={savedPlateSelectValue}>{assignment.plate}</option>
              ) : null}
              {filteredVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate || '(sense matrícula)'}
                  {vehicle.type
                    ? ` · ${
                        TRANSPORT_TYPE_LABELS[normalizeTransportType(vehicle.type)] ||
                        vehicle.type
                      }`
                    : ''}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <select
          value={personValue}
          onChange={(e) => {
            const raw = e.target.value
            if (raw.startsWith('__slot__:')) {
              onLinePatch({ personId: '', personName: line.personName || '' })
              return
            }
            const nextId = raw === '__auto__' ? '' : raw
            const selected = peoplePool.find((person) => person.id === nextId)
            if (
              nextId &&
              isPersonReservedForRoleLine(
                { id: nextId, name: selected?.name },
                reservedPersonIds
              )
            ) {
              toast.warning('Aquesta persona ja està assignada en una altra línia')
              return
            }
            onLinePatch({
              personId: nextId,
              personName: selected?.name || '',
            })
          }}
          className={`${fieldClass} min-w-[14rem] w-[16rem] shrink-0 rounded-md border border-slate-200 bg-white px-2`}
          aria-label="Persona"
        >
          {mode !== 'manual' ? <option value="__auto__">Automàtic</option> : null}
          <option value="">{mode === 'manual' ? 'Tria persona…' : 'Sense assignar'}</option>
          {showSavedNameFallback ? (
            <option value={`__slot__:${line.slotId}`}>{line.personName}</option>
          ) : null}
          {peoplePool.map((person) => (
            <option key={person.id} value={person.id}>
              {formatPersonLabel(person)}
            </option>
          ))}
        </select>

        <Input
          value={line.meetingPoint || ''}
          onChange={(e) => onLinePatch({ meetingPoint: e.target.value })}
          className={`${fieldClass} w-[8.5rem] shrink-0 px-2`}
          placeholder="Lloc"
          aria-label="Lloc"
        />
        <Input
          type="date"
          value={line.serviceDate || ''}
          onChange={(e) => onLinePatch({ serviceDate: e.target.value })}
          className={`${fieldClass} w-[9rem] shrink-0 px-2`}
          aria-label="Data"
        />
        <Input
          type="time"
          value={line.startTime || ''}
          onChange={(e) => onLinePatch({ startTime: e.target.value })}
          className={`${fieldClass} w-[5.35rem] shrink-0 px-1.5 tabular-nums`}
          aria-label="Hora inici esdeveniment"
          title="Hora inici esdeveniment"
        />
        <Input
          type="time"
          value={line.endTime || ''}
          onChange={(e) => onLinePatch({ endTime: e.target.value })}
          className={`${fieldClass} w-[5.35rem] shrink-0 px-1.5 tabular-nums`}
          aria-label="Hora fi esdeveniment"
          title="Hora fi esdeveniment"
        />
        <Input
          type="time"
          value={line.arrivalTime || assignment.arrivalTime || ''}
          onChange={(e) => {
            const value = e.target.value
            onLinePatch({ arrivalTime: value })
            if (isConductor) onAssignmentPatch({ arrivalTime: value })
          }}
          className={`${fieldClass} w-[5.35rem] shrink-0 px-1.5 tabular-nums`}
          aria-label="Hora arribada"
          title="Hora arribada"
        />

        {canRemove ? (
          <button
            type="button"
            onClick={onLineRemove}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Eliminar línia"
            aria-label="Eliminar línia"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
