// file: src/app/menu/quadrants/drafts/components/RowEditor.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Row, Role } from './types'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportType,
} from '@/lib/transportTypes'
import { getExternalWorkerBaseLabel } from '@/lib/quadrantExternalWorkers'

type AvailablePerson = {
  id: string
  name: string
  alias?: string
  meetingPoint?: string
  isDriver?: boolean
  isJamonero?: boolean
}

type AvailableVehicle = {
  id: string
  plate: string
  type: string
  available: boolean
}

type AvailableData = {
  responsables?: AvailablePerson[]
  conductors?: AvailablePerson[]
  treballadors?: AvailablePerson[]
  vehicles?: AvailableVehicle[]
}

type RowEditorProps = {
  row: Row
  available: AvailableData
  isServeisDept?: boolean
  allowExternalWorkerName?: boolean
  canEditMeetingPoint?: boolean
  groupHasDriverController?: boolean
  canEditArrivalTime?: boolean
  onPatch: (patch: Partial<Row>) => void
  onClose: () => void
  onRevert?: () => void
  isLocked: boolean
  vestimentModelChoice?: string
  vestimentModelOptions?: string[]
  onVestimentModelChange?: (value: string) => void
}

/* ------------------------------
   Hook: detecta si Ã©s desktop
   (>= 768px, breakpoint md)
------------------------------ */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)

    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isDesktop
}

const normalizeType = (t?: string) => normalizeTransportType(t)

const normPerson = (value?: string) => (value || '').toString().trim().toLowerCase()

function mergeUniquePeople(...groups: Array<AvailablePerson[] | undefined>): AvailablePerson[] {
  const map = new Map<string, AvailablePerson>()
  groups.forEach((group) => {
    ;(group || []).forEach((p) => {
      const key = (p.id || '').trim() || normPerson(p.name || p.alias || '')
      if (!key) return
      if (!map.has(key)) map.set(key, p)
    })
  })
  return Array.from(map.values())
}

/** Títol: `row.name` del document; roster només si la fila encara no té nom (p. ex. fila nova). */
function rowEditorTitleName(row: Row, available: AvailableData): string {
  const externalLabel = row.isExternal
    ? getExternalWorkerBaseLabel(row.externalType)
    : null
  if (externalLabel && !row.name) return externalLabel

  const rowName = String(row.name || '').trim()
  if (rowName) return rowName

  const allPeople = mergeUniquePeople(
    available?.responsables,
    available?.conductors,
    available?.treballadors
  )
  if (row.id) {
    const match = allPeople.find((p) => p.id === row.id)
    const fromRoster = (match?.name || match?.alias || '').trim()
    if (fromRoster) return fromRoster
  }
  return externalLabel ?? '-'
}

/* ------------------------------
   Subcomponents comuns
------------------------------ */

function EditorHeader({
  displayTitleName,
  role,
  onClose,
  onRevert,
  isLocked,
  compact,
  showVestimentSelector,
  vestimentModelChoice,
  vestimentModelOptions,
  onVestimentModelChange,
}: {
  displayTitleName: string
  role: Role
  onClose: () => void
  onRevert?: () => void
  isLocked: boolean
  compact?: boolean
  showVestimentSelector?: boolean
  vestimentModelChoice?: string
  vestimentModelOptions?: string[]
  onVestimentModelChange?: (value: string) => void
}) {
  return (
    <div
      className={`mb-3 flex items-center gap-2 ${
        compact ? 'gap-2' : ''
      }`}
    >
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700">
        Editant {role}: {displayTitleName}
      </h3>
      {showVestimentSelector ? (
        <div className="w-32 shrink-0">
          <select
            value={vestimentModelChoice || ''}
            onChange={(event) => onVestimentModelChange?.(event.target.value)}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
            disabled={isLocked}
          >
            <option value="">— Cap —</option>
            {vestimentModelChoice && !(vestimentModelOptions || []).includes(vestimentModelChoice) ? (
              <option value={vestimentModelChoice}>{vestimentModelChoice}</option>
            ) : null}
            {(vestimentModelOptions || []).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex shrink-0 gap-2">
        {onRevert && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRevert}
            disabled={isLocked}
          >
            Desfes
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onClose}>
          Tanca
        </Button>
      </div>
    </div>
  )
}

function EditorFields({
  row,
  available,
  isServeisDept = false,
  allowExternalWorkerName = false,
  canEditMeetingPoint = true,
  groupHasDriverController = false,
  canEditArrivalTime = true,
  onPatch,
  isLocked,
}: {
  row: Row
  available: AvailableData
  isServeisDept?: boolean
  allowExternalWorkerName?: boolean
  canEditMeetingPoint?: boolean
  groupHasDriverController?: boolean
  canEditArrivalTime?: boolean
  onPatch: (patch: Partial<Row>) => void
  isLocked: boolean
}) {
  type RoleSelectValue = Role | 'jamonero'
  const normalize = (value?: string) =>
    (value || '').toString().trim().toLowerCase()
  const isServiceCompanion = isServeisDept && row.role === 'treballador'
  const isCenterExternalExtra =
    row.externalType === 'centerExternalExtra' || row.isCenterExternalExtra === true
  const canEditRole = !isCenterExternalExtra
  const isEditableExternalWorker =
    allowExternalWorkerName &&
    row.role === 'treballador' &&
    (row.isExternal || isCenterExternalExtra)
  const showNameAsFixed = isCenterExternalExtra && !isEditableExternalWorker
  const fixedDisplayName = isCenterExternalExtra
    ? row.name || getExternalWorkerBaseLabel(row.externalType)
    : row.name || ''
  const canEditMeetingPointField = canEditMeetingPoint && !isCenterExternalExtra
  const canEditArrivalField = canEditArrivalTime && !isCenterExternalExtra

  const allPeople = mergeUniquePeople(
    available?.responsables,
    available?.conductors,
    available?.treballadors
  )

  const rowPerson =
    allPeople.find((p) => row.id && p.id === row.id) ||
    allPeople.find((p) => row.name && normalize(p.name || p.alias || p.id) === normalize(row.name)) ||
    null

  const responsibleCandidates = mergeUniquePeople(
    available?.responsables,
    rowPerson ? [rowPerson] : []
  )
  const workerCandidates = mergeUniquePeople(
    available?.treballadors,
    rowPerson ? [rowPerson] : []
  )
  const jamoneroWorkerCandidates = workerCandidates.filter(
    (person) => person.isJamonero === true
  )
  const isCurrentInResponsables = (available?.responsables || []).some(
    (p) =>
      (row.id && p.id === row.id) ||
      (row.name && normalize(p.name || p.alias || p.id) === normalize(row.name))
  )
  const isCurrentInConductors = (available?.conductors || []).some(
    (p) =>
      (row.id && p.id === row.id) ||
      (row.name && normalize(p.name || p.alias || p.id) === normalize(row.name))
  )

  const isEmptyDraftRow = !row.id && !row.name
  const canSelectResponsible = Boolean(
    isEmptyDraftRow ||
      row.role === 'responsable' ||
      isCurrentInResponsables
  )
  const canSelectConductor = Boolean(
    isEmptyDraftRow ||
      row.role === 'conductor' ||
      isCurrentInConductors
  )
  const selectedRoleValue: RoleSelectValue =
    row.role === 'treballador' && row.isJamonero ? 'jamonero' : row.role
  const list: AvailablePerson[] =
    row.isJamonero === true
      ? jamoneroWorkerCandidates
      : row.role === 'responsable'
      ? responsibleCandidates
      : row.role === 'conductor'
      ? available?.conductors || []
      : workerCandidates


  // --- RESPONSABLE / CONDUCTOR / TREBALLADOR ---
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {canEditRole && (row.role === 'conductor' || row.role === 'treballador' || row.role === 'responsable') && (
          <div>
            <label className="text-xs font-medium">Rol</label>
            <select
              value={selectedRoleValue}
              onChange={(e) => {
                const nextRoleValue = e.target.value as RoleSelectValue
                const nextRole = nextRoleValue === 'jamonero' ? 'treballador' : nextRoleValue
                const nextIsJamonero = nextRoleValue === 'jamonero'
                const selectedPerson = list.find((person) => person.id === row.id)
                const clearInvalidSelection =
                  nextRole === 'conductor' &&
                  nextIsJamonero &&
                  selectedPerson &&
                  selectedPerson.isDriver !== true
                const clearNonJamoneroSelection =
                  nextIsJamonero &&
                  selectedPerson &&
                  selectedPerson.isJamonero !== true

                onPatch({
                  role: nextRole,
                  isJamonero: nextIsJamonero,
                  ...(nextRole !== 'treballador' ? { isExternal: false } : {}),
                  ...((clearInvalidSelection || clearNonJamoneroSelection) ? { id: '', name: '' } : {}),
                })
              }}
              className="w-full rounded border px-2 py-1 text-sm"
              disabled={isLocked}
            >
              {canSelectResponsible && <option value="responsable">Responsable</option>}
              {canSelectConductor && <option value="conductor">Conductor</option>}
              <option value="treballador">Treballador</option>
              <option value="jamonero">Jamonero</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium">
            {isEditableExternalWorker
              ? `Nom ${getExternalWorkerBaseLabel(row.externalType)}`
              : 'Nom'}
          </label>
          {showNameAsFixed ? (
            <Input
              value={fixedDisplayName}
              className="w-full text-sm"
              disabled
            />
          ) : isEditableExternalWorker ? (
            <Input
              value={row.name || ''}
              onChange={(e) => onPatch({ id: '', name: e.target.value })}
              placeholder={`${getExternalWorkerBaseLabel(row.externalType)} o nom de la persona`}
              className="w-full text-sm"
              disabled={isLocked}
            />
          ) : (
            <select
              value={row.id || ''}
              onChange={(e) => {
                const sel = list.find((p) => p.id === e.target.value)
                const displayName = sel?.name || sel?.alias || sel?.id || ''
                const rowControlsMeetingPoint =
                  row.role === 'conductor' || (row.role === 'responsable' && row.isDriver)
                const shouldSyncMeetingPoint = !isServeisDept || rowControlsMeetingPoint

                onPatch({
                  id: sel?.id || '',
                  name: displayName,
                  isExternal: false,
                  externalType: undefined,
                  isCenterExternalExtra: false,
                  ...(shouldSyncMeetingPoint && sel?.meetingPoint
                    ? { meetingPoint: sel.meetingPoint }
                    : {}),
                })
              }}
              className="w-full rounded border px-2 py-1 text-sm"
              disabled={isLocked}
            >
              <option value="">
                {selectedRoleValue === 'jamonero'
                  ? 'Selecciona jamonero'
                  : `Selecciona ${selectedRoleValue}`}
              </option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.alias || p.id}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="text-xs font-medium">Lloc convocatoria</label>
          <Input
            value={row.meetingPoint || ''}
            onChange={(e) => onPatch({ meetingPoint: e.target.value })}
            placeholder="Lloc..."
            className="w-full text-sm"
            disabled={isLocked || !canEditMeetingPointField}
          />
        </div>
      </div>

      {/* Vehicle (nomes conductors fora de serveis) */}
      {row.role === 'conductor' && !isServeisDept && (
        <div className="mt-3 flex flex-col gap-3 md:grid md:grid-cols-2">
          <div>
            <label className="text-xs font-medium">Tipus de vehicle</label>
            <select
              value={row.vehicleType || ''}
              onChange={(e) =>
                onPatch({ vehicleType: e.target.value, plate: '' })
              }
              className="w-full rounded border px-2 py-1 text-sm"
              disabled={isLocked}
            >
              <option value="">- Selecciona tipus -</option>
              {TRANSPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium">Matricula</label>
            <select
              value={row.plate || ''}
              onChange={(e) => onPatch({ plate: e.target.value })}
              className="w-full rounded border px-2 py-1 text-sm"
              disabled={isLocked || !row.vehicleType}
            >
              <option value="">- Selecciona matricula -</option>
              {(available?.vehicles || [])
                .filter(
                  (v) =>
                    v.available &&
                    (!row.vehicleType ||
                      normalizeType(v.type) === normalizeType(row.vehicleType))
                )
                .map((v) => (
                  <option key={v.id} value={v.plate}>
                    {v.plate}
                    {v.type
                      ? ` - ${TRANSPORT_TYPE_LABELS[normalizeTransportType(v.type)] || v.type}`
                      : ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium">Hora d'arribada</label>
            <Input
              type="time"
              value={row.arrivalTime || ''}
              onChange={(e) => onPatch({ arrivalTime: e.target.value })}
              className="w-full text-sm"
              disabled={isLocked || !canEditArrivalField}
            />
          </div>
        </div>
      )}

      {/* Dates i hores */}
      <div className={`mt-3 flex flex-col gap-3 md:grid ${isCenterExternalExtra ? 'md:grid-cols-3' : 'md:grid-cols-5'}`}>
        <div>
          <label className="text-xs">Data inici</label>
          <Input
            type="date"
            value={row.startDate}
            onChange={(e) =>
              onPatch(
                isCenterExternalExtra
                  ? { startDate: e.target.value, endDate: e.target.value }
                  : { startDate: e.target.value }
              )
            }
            className="w-full text-sm"
            disabled={isLocked}
          />
        </div>
        <div>
          <label className="text-xs">Hora inici</label>
          <Input
            type="time"
            value={row.startTime}
            onChange={(e) => onPatch({ startTime: e.target.value })}
            className="w-full text-sm"
            disabled={isLocked || isServiceCompanion}
          />
        </div>
        {!isCenterExternalExtra && (
        <div>
          <label className="text-xs">Data fi</label>
          <Input
            type="date"
            value={row.endDate}
            onChange={(e) => onPatch({ endDate: e.target.value })}
            className="w-full text-sm"
            disabled={isLocked}
          />
        </div>
        )}
        <div>
          <label className="text-xs">Hora fi</label>
          <Input
            type="time"
            value={row.endTime}
            onChange={(e) => onPatch({ endTime: e.target.value })}
            className="w-full text-sm"
            disabled={isLocked}
          />
        </div>
        {!isCenterExternalExtra && (
        <div>
          <label className="text-xs">Hora arribada</label>
          <Input
            type="time"
            value={row.arrivalTime || ''}
            onChange={(e) => onPatch({ arrivalTime: e.target.value })}
            className="w-full text-sm"
            disabled={isLocked || isServiceCompanion || !canEditArrivalField}
          />
        </div>
        )}
      </div>
    </>
  )
}

/* ------------------------------
   Component principal
------------------------------ */
export default function RowEditor(props: RowEditorProps) {
  const {
    row,
    available,
    isServeisDept = false,
    allowExternalWorkerName = false,
    canEditMeetingPoint = true,
    groupHasDriverController = false,
    canEditArrivalTime = true,
    onPatch,
    onClose,
    onRevert,
    isLocked,
    vestimentModelChoice = '',
    vestimentModelOptions = [],
    onVestimentModelChange,
  } = props
  const isDesktop = useIsDesktop()
  const displayTitleName = rowEditorTitleName(row, available)

  const content = (
    <>
      <EditorHeader
        displayTitleName={displayTitleName}
        role={row.role}
        onClose={onClose}
        onRevert={onRevert}
        isLocked={isLocked}
        compact={!isDesktop}
        showVestimentSelector={isServeisDept && row.role === 'responsable'}
        vestimentModelChoice={vestimentModelChoice}
        vestimentModelOptions={vestimentModelOptions}
        onVestimentModelChange={onVestimentModelChange}
      />
      <EditorFields
        row={row}
        available={available}
        isServeisDept={isServeisDept}
        allowExternalWorkerName={allowExternalWorkerName}
        canEditMeetingPoint={canEditMeetingPoint}
        groupHasDriverController={groupHasDriverController}
        canEditArrivalTime={canEditArrivalTime}
        onPatch={onPatch}
        isLocked={isLocked}
      />
    </>
  )

  // Desktop / mobile render
  if (isDesktop) {
    return (
      <div className="col-span-full bg-gray-50 px-4 py-3">
        {content}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full max-h-[90vh] rounded-t-3xl bg-white p-4 shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto max-w-md space-y-3">{content}</div>
      </div>
    </div>
  )
}
