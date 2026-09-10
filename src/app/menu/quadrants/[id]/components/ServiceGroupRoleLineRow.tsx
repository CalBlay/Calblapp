'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, GraduationCap, Truck, User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
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

const normalizePersonSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ca')
    .trim()

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
  const [personPickerOpen, setPersonPickerOpen] = useState(false)
  const [personSearch, setPersonSearch] = useState('')
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

  const normalizedPersonSearch = normalizePersonSearch(personSearch)
  const filteredPeople = useMemo(() => {
    if (!normalizedPersonSearch) return people
    return people
      .filter((person) => normalizePersonSearch(person.name).includes(normalizedPersonSearch))
  }, [normalizedPersonSearch, people])

  const selectedPersonLabel = line.personName || selectedInPool?.name || ''
  const personInputPlaceholder =
    mode !== 'manual'
      ? 'Automàtic'
      : line.role === 'conductor'
        ? 'Tria conductor…'
        : line.role === 'responsable'
          ? 'Tria responsable…'
          : 'Tria treballador…'

  const selectPerson = (raw: string) => {
    if (raw.startsWith('__slot__:')) {
      onPatch({ personId: '', personName: line.personName || '' })
      setPersonPickerOpen(false)
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

    onPatch({ personId: nextId, personName: selected?.name || '' })
    setPersonPickerOpen(false)
  }

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
        <Popover
          open={personPickerOpen}
          onOpenChange={(open) => {
            setPersonPickerOpen(open)
            if (!open) setPersonSearch('')
          }}
        >
          <div className="relative">
            <PopoverAnchor asChild>
              <Input
                value={personPickerOpen ? personSearch : selectedPersonLabel}
                onClick={() => {
                  if (!personPickerOpen) setPersonSearch('')
                  setPersonPickerOpen(true)
                }}
                onFocus={() => {
                  if (!personPickerOpen) setPersonSearch('')
                  setPersonPickerOpen(true)
                }}
                onChange={(event) => {
                  setPersonSearch(event.target.value)
                  if (!personPickerOpen) setPersonPickerOpen(true)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setPersonPickerOpen(false)
                  if (event.key === 'Enter' && filteredPeople.length > 0) {
                    event.preventDefault()
                    selectPerson(filteredPeople[0].id)
                  }
                }}
                placeholder={personInputPlaceholder}
                role="combobox"
                data-quadrant-editor-command="open-person-search"
                aria-expanded={personPickerOpen}
                aria-autocomplete="list"
                aria-label="Persona"
                autoComplete="off"
                className="h-8 bg-white pr-8 text-sm"
              />
            </PopoverAnchor>
            <ChevronsUpDown
              className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          </div>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-2"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className="max-h-64 overflow-y-auto">
              <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                {mode !== 'manual' ? (
                  <button
                    type="button"
                    onClick={() => selectPerson('__auto__')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                  >
                    Automàtic
                    {!line.personId && !line.personName ? <Check className="h-4 w-4" /> : null}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => selectPerson('')}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  {mode === 'manual' ? 'Sense persona' : 'Sense assignar'}
                  {mode === 'manual' && !line.personId && !line.personName ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </button>
                {showSavedNameFallback ? (
                  <button
                    type="button"
                    onClick={() => selectPerson(`__slot__:${line.slotId}`)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                  >
                    <span className="truncate">{line.personName}</span>
                    {personValue.startsWith('__slot__:') ? <Check className="h-4 w-4" /> : null}
                  </button>
                ) : null}
              </div>

              {filteredPeople.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">No s'ha trobat cap persona.</p>
              ) : (
                <ul className="space-y-0.5 pt-1.5">
                  {filteredPeople.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => selectPerson(person.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100',
                          line.personId === person.id && 'bg-slate-100'
                        )}
                      >
                        <span className="truncate">
                          {formatPersonLabel(
                            person,
                            useCrewOrdering && isCrewMember(person, crewMembers)
                          )}
                        </span>
                        {line.personId === person.id ? (
                          <Check className="ml-2 h-4 w-4 shrink-0" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>
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
