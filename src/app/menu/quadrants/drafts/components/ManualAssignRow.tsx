'use client'

import React, { useMemo } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import {
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportType,
} from '@/lib/transportTypes'
import type { PersonnelOption } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import { roleIconMap } from './draftsTableDisplayUtils'
import type { Row } from './types'
import {
  getManualAssignDeptConfig,
  inferEndDateFromTimes,
  roleSelectValueFromRow,
  type RoleSelectValue,
} from '@/lib/manualAssignModel'

type Vehicle = {
  id: string
  plate: string
  type: string
  available: boolean
}

type Props = {
  row: Row
  department: string
  responsables: PersonnelOption[]
  conductors: PersonnelOption[]
  treballadors: PersonnelOption[]
  vehicles: Vehicle[]
  isLocked: boolean
  onPatch: (patch: Partial<Row>) => void
  onRoleChange: (value: RoleSelectValue) => void
  onRemove: () => void
}

const formatPersonLabel = (person: PersonnelOption) => {
  if (person.status === 'conflict') {
    return `${person.name} — ocupat${person.reason ? `: ${person.reason}` : ''}`
  }
  if (person.status === 'notfound') return `${person.name} — sense dades`
  return `${person.name} · disponible`
}

const sortPeople = (people: PersonnelOption[]) =>
  [...people].sort((a, b) => {
    const order = { available: 0, conflict: 1, notfound: 2 } as const
    const ao = order[a.status] ?? 2
    const bo = order[b.status] ?? 2
    if (ao !== bo) return ao - bo
    return a.name.localeCompare(b.name, 'ca')
  })

const formatDateShort = (iso?: string) => {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}`
}

export default function ManualAssignRow({
  row,
  department,
  responsables,
  conductors,
  treballadors,
  vehicles,
  isLocked,
  onPatch,
  onRoleChange,
  onRemove,
}: Props) {
  const config = getManualAssignDeptConfig(department)
  const roleValue = roleSelectValueFromRow(row)

  const people = useMemo(() => {
    if (roleValue === 'jamonero') {
      return sortPeople(treballadors.filter((p) => p.isJamonero === true))
    }
    if (row.role === 'responsable') return sortPeople(responsables)
    if (row.role === 'conductor') return sortPeople(conductors)
    return sortPeople(treballadors)
  }, [conductors, responsables, roleValue, row.role, treballadors])

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          v.available &&
          (!row.vehicleType ||
            normalizeTransportType(v.type) === normalizeTransportType(row.vehicleType))
      ),
    [row.vehicleType, vehicles]
  )

  const showVehicleFields =
    config.showVehicleFields && (row.role === 'conductor' || (row.role === 'responsable' && row.isDriver))

  const spansMidnight =
    Boolean(row.startDate && row.endDate && row.startDate !== row.endDate) ||
    (Boolean(row.startTime && row.endTime) &&
      inferEndDateFromTimes(row.startDate, row.startTime, row.endTime) !== row.startDate)

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100">
          {row.role === 'treballador' && row.isJamonero ? (
            <span className="text-sm" title="Jamonero">
              🐷
            </span>
          ) : (
            roleIconMap[row.role]
          )}
        </span>

        <select
          value={roleValue}
          onChange={(e) => onRoleChange(e.target.value as RoleSelectValue)}
          disabled={isLocked}
          className="h-8 w-[7.5rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs"
          aria-label="Rol"
        >
          <option value="responsable">Responsable</option>
          <option value="conductor">Conductor</option>
          <option value="treballador">Treballador</option>
          {config.isServeis ? <option value="jamonero">Jamonero</option> : null}
        </select>

        <select
          value={row.id || ''}
          onChange={(e) => {
            const sel = people.find((p) => p.id === e.target.value)
            onPatch({
              id: sel?.id || '',
              name: sel?.name || '',
              isExternal: false,
            })
          }}
          disabled={isLocked}
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm"
          aria-label="Persona"
        >
          <option value="">Tria persona…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {formatPersonLabel(p)}
            </option>
          ))}
        </select>

        <Input
          type="text"
          value={row.meetingPoint || ''}
          onChange={(e) => onPatch({ meetingPoint: e.target.value })}
          placeholder="Lloc"
          disabled={isLocked}
          className="h-8 w-[7.5rem] shrink-0 text-xs sm:w-[9rem]"
          aria-label="Lloc convocatòria"
        />

        {!isLocked ? (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Eliminar línia"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-10">
        <Input
          type="date"
          value={row.startDate || ''}
          onChange={(e) => onPatch({ startDate: e.target.value })}
          disabled={isLocked}
          className="h-8 w-[9.5rem] shrink-0 text-xs"
          aria-label="Data inici"
          title="Data inici"
        />
        <Input
          type="time"
          value={row.startTime || ''}
          onChange={(e) => onPatch({ startTime: e.target.value })}
          disabled={isLocked}
          className="h-8 w-[6.5rem] shrink-0 text-xs"
          aria-label="Hora inici"
          title="Hora inici"
        />
        <Input
          type="time"
          value={row.endTime || ''}
          onChange={(e) => onPatch({ endTime: e.target.value })}
          disabled={isLocked}
          className="h-8 w-[6.5rem] shrink-0 text-xs"
          aria-label="Hora fi"
          title="Hora fi"
        />
        {spansMidnight ? (
          <span
            className={cn(
              'inline-flex h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-xs text-amber-900',
              typography('bodyXs')
            )}
            title="Data fi (torn de nit)"
          >
            Fi {formatDateShort(row.endDate)}
          </span>
        ) : null}
      </div>

      {showVehicleFields ? (
        <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-10">
          <select
            value={row.vehicleType || ''}
            onChange={(e) => onPatch({ vehicleType: e.target.value, plate: '' })}
            disabled={isLocked}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
            aria-label="Tipus vehicle"
          >
            <option value="">Tipus</option>
            {TRANSPORT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={row.plate || ''}
            onChange={(e) => onPatch({ plate: e.target.value })}
            disabled={isLocked || !row.vehicleType}
            className="h-8 min-w-[7rem] rounded-md border border-slate-200 bg-white px-2 text-xs"
            aria-label="Matrícula"
          >
            <option value="">Matrícula</option>
            {filteredVehicles.map((v) => (
              <option key={v.id} value={v.plate}>
                {v.plate}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {config.showArrivalTime && row.role === 'conductor' ? (
        <div className="pl-10 sm:pl-10">
          <input
            type="time"
            value={row.arrivalTime || ''}
            onChange={(e) => onPatch({ arrivalTime: e.target.value })}
            disabled={isLocked}
            className={cn(
              'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs',
              typography('bodyXs')
            )}
            aria-label="Arribada"
            title="Hora arribada"
          />
        </div>
      ) : null}
    </div>
  )
}
