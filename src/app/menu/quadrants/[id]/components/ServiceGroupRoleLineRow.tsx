'use client'

import { toast } from 'sonner'
import { GraduationCap, Truck, User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { ResponsableAvailabilityOption } from '../hooks/useQuadrantFormState'
import type { ServeiGroupRoleLine, ServeiRoleKey } from '../phaseConfig'
import {
  isCrewMember,
  sortPeopleWithCrewFirst,
  type CrewMemberRef,
} from '@/lib/driverCrewUtils'
import { isResponsiblePerson } from '@/lib/personnelRoles'
import {
  isPersonReservedForRoleLine,
  normalizeRoleLinePersonKey,
} from '../lib/quadrantPayloadShared'

type PersonOption = {
  id: string
  name: string
  status?: string
  reason?: string
  isJamonero?: boolean
  role?: string
  isResponsible?: boolean
}

type Props = {
  line: ServeiGroupRoleLine
  mode: 'auto' | 'semi' | 'manual'
  responsables: ResponsableAvailabilityOption[]
  conductors: PersonOption[]
  treballadors: PersonOption[]
  crewMembers?: CrewMemberRef[]
  reservedPersonIds: Set<string>
  onPatch: (patch: Partial<ServeiGroupRoleLine>) => void
  onRemove: () => void
  canRemove: boolean
  /** Per logística: només treballador/conductor sense jamonero ni responsable de línia. */
  allowedRoles?: ServeiRoleKey[]
  /** Amaga el selector de rol (p. ex. només treballadors). */
  hideRoleSelect?: boolean
}

const roleIcon: Record<ServeiRoleKey, React.ReactNode> = {
  responsable: <GraduationCap className="h-4 w-4 text-blue-700" aria-hidden />,
  conductor: <Truck className="h-4 w-4 text-orange-500" aria-hidden />,
  treballador: <User className="h-4 w-4 text-green-600" aria-hidden />,
  jamonero: <span className="text-sm" aria-hidden>🐷</span>,
}

const formatPersonLabel = (person: PersonOption, inCrew = false) => {
  const crewPrefix = inCrew ? '★ ' : ''
  if (person.status === 'conflict') {
    return `${crewPrefix}${person.name} — ocupat${person.reason ? `: ${person.reason}` : ''}`
  }
  if (person.status === 'notfound') return `${crewPrefix}${person.name} — sense dades`
  if (inCrew) return `${crewPrefix}${person.name} · equip`
  return person.name
}

function peopleForRole(
  role: ServeiRoleKey,
  responsables: ResponsableAvailabilityOption[],
  conductors: PersonOption[],
  treballadors: PersonOption[]
): PersonOption[] {
  if (role === 'responsable') {
    return responsables
      .filter(
        (person) => person.status === 'available' && isResponsiblePerson(person)
      )
      .map((person) => ({ id: person.id, name: person.name, status: person.status, reason: person.reason }))
  }
  if (role === 'conductor') {
    return conductors.map((person) => ({ ...person }))
  }
  if (role === 'jamonero') {
    return treballadors.filter((person) => person.isJamonero === true)
  }
  return treballadors
}

const DEFAULT_ALLOWED_ROLES: ServeiRoleKey[] = ['conductor', 'responsable', 'treballador', 'jamonero']

export default function ServiceGroupRoleLineRow({
  line,
  mode,
  responsables,
  conductors,
  treballadors,
  crewMembers = [],
  reservedPersonIds,
  onPatch,
  onRemove,
  canRemove,
  allowedRoles = DEFAULT_ALLOWED_ROLES,
  hideRoleSelect = false,
}: Props) {
  const normalize = normalizeRoleLinePersonKey
  const basePeople = peopleForRole(line.role, responsables, conductors, treballadors).filter((person) => {
    const pid = normalize(person.id)
    if (!pid) return false
    if (normalize(line.personId) === pid) return true
    if (
      !line.personId &&
      normalize(line.personName) &&
      normalize(line.personName) === normalize(person.name)
    ) {
      return true
    }
    return !isPersonReservedForRoleLine(person, reservedPersonIds)
  })
  const useCrewOrdering =
    crewMembers.length > 0 && (line.role === 'treballador' || line.role === 'jamonero')
  const people = useCrewOrdering
    ? sortPeopleWithCrewFirst(basePeople, crewMembers)
    : basePeople

  const savedNameValue = line.personName && !line.personId ? `__slot__:${line.slotId}` : ''
  const personValue =
    mode === 'manual'
      ? line.personId || savedNameValue
      : line.personId || '__auto__'
  const selectedInPool = line.personId
    ? people.find((person) => person.id === line.personId)
    : undefined
  const showSavedNameFallback =
    Boolean(String(line.personName || '').trim()) &&
    !selectedInPool &&
    (!line.personId || !people.some((person) => person.id === line.personId))

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-slate-200">
        {roleIcon[line.role]}
      </span>

      {hideRoleSelect ? null : (
        <div className="w-[8.5rem] shrink-0">
          <select
            value={line.role}
            onChange={(e) =>
              onPatch({
                role: e.target.value as ServeiRoleKey,
                personId: '',
                personName: '',
              })
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
            aria-label="Rol"
          >
            {allowedRoles.includes('conductor') ? <option value="conductor">Conductor</option> : null}
            {allowedRoles.includes('responsable') ? (
              <option value="responsable">Responsable</option>
            ) : null}
            {allowedRoles.includes('treballador') ? (
              <option value="treballador">Treballador</option>
            ) : null}
            {allowedRoles.includes('jamonero') ? <option value="jamonero">Jamonero</option> : null}
          </select>
        </div>
      )}

      <div className="min-w-[12rem] flex-1">
        <select
          value={personValue}
          onChange={(e) => {
            const raw = e.target.value
            if (raw.startsWith('__slot__:')) {
              onPatch({
                personId: '',
                personName: line.personName || '',
              })
              return
            }
            const nextId = raw === '__auto__' ? '' : raw
            const selected = people.find((person) => person.id === nextId)
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
            onPatch({
              personId: nextId,
              personName: selected?.name || '',
            })
          }}
          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
          aria-label="Persona"
        >
          {mode !== 'manual' ? <option value="__auto__">Automàtic</option> : null}
          <option value="">{mode === 'manual' ? 'Tria persona…' : 'Sense assignar'}</option>
          {showSavedNameFallback ? (
            <option value={`__slot__:${line.slotId}`}>{line.personName}</option>
          ) : null}
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {formatPersonLabel(person, useCrewOrdering && isCrewMember(person, crewMembers))}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[9rem] shrink-0">
        <Input
          value={line.meetingPoint || ''}
          onChange={(e) => onPatch({ meetingPoint: e.target.value })}
          className="h-8 text-xs"
          placeholder="Lloc"
          aria-label="Lloc"
        />
      </div>

      <div className="w-[9.5rem] shrink-0">
        <Input
          type="date"
          value={line.serviceDate || ''}
          onChange={(e) => onPatch({ serviceDate: e.target.value })}
          className="h-8 text-xs"
          aria-label="Data"
        />
      </div>

      <div className="w-[6.5rem] shrink-0">
        <Input
          type="time"
          value={line.startTime || ''}
          onChange={(e) => onPatch({ startTime: e.target.value })}
          className="h-8 text-xs"
          aria-label="Hora inici"
        />
      </div>

      <div className="w-[6.5rem] shrink-0">
        <Input
          type="time"
          value={line.endTime || ''}
          onChange={(e) => onPatch({ endTime: e.target.value })}
          className="h-8 text-xs"
          aria-label="Hora fi"
        />
      </div>

      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="Eliminar línia"
          aria-label="Eliminar línia"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
