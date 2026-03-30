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

/* ------------------------------
   Subcomponents comuns
------------------------------ */

function EditorHeader({
  row,
  onClose,
  onRevert,
  isLocked,
  compact,
}: {
  row: Row
  onClose: () => void
  onRevert?: () => void
  isLocked: boolean
  compact?: boolean
}) {
  const displayName = row.isCenterExternalExtra ? 'Extra C.Extern' : row.name || '-'
  return (
    <div
      className={`mb-3 flex items-center justify-between ${
        compact ? 'gap-2' : ''
      }`}
    >
      <h3 className="text-sm font-semibold text-gray-700">
        Editant {row.role}: {displayName}
      </h3>
      <div className="flex gap-2">
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
  const normalize = (value?: string) =>
    (value || '').toString().trim().toLowerCase()
  const isServiceCompanion = isServeisDept && row.role === 'treballador'
  const isCenterExternalExtra = row.isCenterExternalExtra === true
  const canEditRole = !isCenterExternalExtra
  const showNameAsFixed = isCenterExternalExtra
  const fixedDisplayName = isCenterExternalExtra ? 'Extra C.Extern' : row.name || ''
  const canEditMeetingPointField = canEditMeetingPoint && !isCenterExternalExtra
  const canEditArrivalField = canEditArrivalTime && !isCenterExternalExtra

  const mergeUniquePeople = (...groups: Array<AvailablePerson[] | undefined>) => {
    const map = new Map<string, AvailablePerson>()
    groups.forEach((group) => {
      ;(group || []).forEach((p) => {
        const key = (p.id || '').trim() || normalize(p.name || p.alias || '')
        if (!key) return
        if (!map.has(key)) map.set(key, p)
      })
    })
    return Array.from(map.values())
  }

  const allPeople = mergeUniquePeople(
    available?.responsables,
    available?.conductors,
    available?.treballadors
  )

  const jamoneroCandidates = mergeUniquePeople(
    available?.conductors,
    available?.treballadors
  ).filter((person) => person.isJamonero === true)

  const rowPerson =
    allPeople.find((p) => row.id && p.id === row.id) ||
    allPeople.find((p) => row.name && normalize(p.name || p.alias || p.id) === normalize(row.name)) ||
    null

  const responsibleCandidates = mergeUniquePeople(
    available?.responsables,
    rowPerson ? [rowPerson] : []
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

  const canSelectResponsible = Boolean(
    row.role === 'responsable' ||
      isCurrentInResponsables
  )
  const canSelectConductor = Boolean(
    row.role === 'conductor' ||
      isCurrentInConductors ||
      (row.isJamonero === true &&
        ((rowPerson?.isDriver === true) || jamoneroCandidates.some((person) => person.isDriver === true)))
  )
  const isEditableExternalWorker =
    allowExternalWorkerName &&
    row.role === 'treballador' &&
    row.isExternal

  const list: AvailablePerson[] =
    row.isJamonero === true
      ? row.role === 'conductor'
        ? jamoneroCandidates.filter((person) => person.isDriver === true)
        : jamoneroCandidates
      : row.role === 'responsable'
      ? responsibleCandidates
      : row.role === 'conductor'
      ? available?.conductors || []
      : available?.treballadors || []


  // --- RESPONSABLE / CONDUCTOR / TREBALLADOR ---
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {canEditRole && (row.role === 'conductor' || row.role === 'treballador' || row.role === 'responsable') && (
          <div>
            <label className="text-xs font-medium">Rol</label>
            <select
              value={row.role}
              onChange={(e) => {
                const nextRole = e.target.value as Role
                const selectedPerson = list.find((person) => person.id === row.id)
                const clearInvalidSelection =
                  nextRole === 'conductor' &&
                  row.isJamonero === true &&
                  selectedPerson &&
                  selectedPerson.isDriver !== true

                onPatch({
                  role: nextRole,
                  ...(nextRole !== 'treballador' ? { isExternal: false } : {}),
                  ...(clearInvalidSelection ? { id: '', name: '' } : {}),
                })
              }}
              className="w-full rounded border px-2 py-1 text-sm"
              disabled={isLocked}
            >
              {canSelectResponsible && row.isJamonero !== true && <option value="responsable">Responsable</option>}
              {canSelectConductor && <option value="conductor">Conductor</option>}
              <option value="treballador">Treballador</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium">{isEditableExternalWorker ? 'Nom ETT' : 'Nom'}</label>
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
              placeholder="ETT o nom de la persona"
              className="w-full text-sm"
              disabled={isLocked}
            />
          ) : (
            <select
              value={row.id || ''}
              onChange={(e) => {
                const sel = list.find((p) => p.id === e.target.value)
                const displayName = sel?.name || sel?.alias || sel?.id || ''
                onPatch({ id: sel?.id || '', name: displayName, isExternal: false })
                const rowControlsMeetingPoint =
                  row.role === 'conductor' || (row.role === 'responsable' && row.isDriver)
                const shouldSyncMeetingPoint = !isServeisDept || rowControlsMeetingPoint
                if (shouldSyncMeetingPoint && sel?.meetingPoint)
                  onPatch({ meetingPoint: sel.meetingPoint })
              }}
              className="w-full rounded border px-2 py-1 text-sm"
              disabled={isLocked}
            >
              <option value="">Selecciona {row.role}</option>
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
  } = props
  const isDesktop = useIsDesktop()

  const content = (
    <>
      <EditorHeader
        row={row}
        onClose={onClose}
        onRevert={onRevert}
        isLocked={isLocked}
        compact={!isDesktop}
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
