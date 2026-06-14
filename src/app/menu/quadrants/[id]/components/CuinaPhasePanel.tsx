'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import PhaseCard, { PhaseUnifiedMarker } from './PhaseCard'
import QuadrantTopBarCuina from './QuadrantTopBarCuina'
import CuinaGroupRoleLineRow from './CuinaGroupRoleLineRow'
import type { CuinaEttState, CuinaGroup } from './quadrantModalTypes'
import type { AvailableVehicle } from '../phaseConfig'
import type { ResponsableAvailabilityOption } from '../hooks/useQuadrantFormState'
import type { ComponentProps } from 'react'
import {
  applyCuinaDefaultsToRoleLines,
  createEmptyCuinaRoleLine,
  createCenterExternalExtraLine,
  ensureCuinaRoleLines,
  ensureCuinaVehicleAssignments,
  findCuinaAssignmentForLine,
  patchCuinaGroupRoleLines,
} from '../lib/cuinaGroupRoleLines'
import { buildReservedForRoleLine } from '../lib/quadrantPayloadShared'

type CuinaTopBarProps = Omit<ComponentProps<typeof QuadrantTopBarCuina>, 'embedded'>

type Props = {
  groups: CuinaGroup[]
  eventStartDate: string
  mode?: 'auto' | 'semi' | 'manual'
  compact?: boolean
  availableResponsables: ResponsableAvailabilityOption[]
  availableConductors: Array<{ id: string; name: string; status?: string; reason?: string }>
  availableTreballadors?: Array<{ id: string; name: string; status?: string; reason?: string }>
  availableVehicles: AvailableVehicle[]
  availableVehicleCount: number
  isVehicleIdAssigned: (vehicleId: string, groupId: string, slotId: string) => boolean
  addGroup: () => void
  removeGroup: (id: string) => void
  updateGroup: (id: string, patch: Partial<CuinaGroup>) => void
  cuinaEtt: CuinaEttState
  toggleEtt: () => void
  updateEtt: (patch: Partial<CuinaEttState['data']>) => void
  cuinaTopBar?: CuinaTopBarProps
}

export default function CuinaPhasePanel({
  groups,
  eventStartDate,
  mode = 'semi',
  compact = false,
  availableResponsables,
  availableConductors,
  availableTreballadors = [],
  availableVehicles,
  availableVehicleCount,
  isVehicleIdAssigned: _isVehicleIdAssigned,
  addGroup,
  removeGroup,
  updateGroup,
  cuinaEtt,
  toggleEtt,
  updateEtt,
  cuinaTopBar,
}: Props) {
  const normalize = (value?: string) => String(value || '').trim().toLowerCase()

  const patchGroup = (
    group: CuinaGroup,
    updater: Parameters<typeof patchCuinaGroupRoleLines>[1]
  ) => patchCuinaGroupRoleLines(group, updater)

  const patchAssignmentForLine = (
    group: CuinaGroup,
    line: ReturnType<typeof ensureCuinaRoleLines>[number],
    patch: Partial<import('../phaseConfig').VehicleAssignment>
  ) => {
    const assignments = ensureCuinaVehicleAssignments(group)
    const idx = assignments.findIndex((entry) => entry.slotId === line.slotId)
    const nextAssignments = [...assignments]
    if (idx < 0) {
      nextAssignments.push({ ...findCuinaAssignmentForLine(assignments, line), ...patch })
    } else {
      nextAssignments[idx] = { ...nextAssignments[idx], ...patch }
    }
    updateGroup(group.id, { vehicleAssignments: nextAssignments })
  }

  const allAssignedVehicleIds = new Set(
    groups.flatMap((group) =>
      (group.vehicleAssignments || []).map((a) => a.vehicleId).filter(Boolean)
    )
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
        compact && 'rounded-lg shadow-none'
      )}
    >
      {cuinaTopBar ? <QuadrantTopBarCuina {...cuinaTopBar} embedded /> : null}
      <div className={compact ? 'space-y-2 p-2' : 'space-y-4 p-4'}>
        <PhaseCard
          label="Event"
          selected
          visible
          compact={compact}
          hideHeaderLabel
          unifiedMarker
          onToggleSelection={() => undefined}
          onToggleVisibility={() => undefined}
        >
          <>
            {groups.map((group) => {
              const assignments = ensureCuinaVehicleAssignments(group)
              const roleLines = ensureCuinaRoleLines(group, assignments)
              const reservedPersonIds = new Set<string>()
              groups.forEach((other) => {
                if (other.id === group.id) return
                ensureCuinaRoleLines(other, ensureCuinaVehicleAssignments(other)).forEach((line) => {
                  const pid = normalize(line.personId)
                  if (pid) reservedPersonIds.add(pid)
                })
              })
              roleLines.forEach((line) => {
                const pid = normalize(line.personId)
                if (pid) reservedPersonIds.add(pid)
              })
              const manualRespId = normalize(cuinaTopBar?.manualResp)
              if (manualRespId && manualRespId !== '__auto__') {
                reservedPersonIds.add(manualRespId)
              }
              if (group.responsibleId) {
                reservedPersonIds.add(normalize(group.responsibleId))
              }

              const groupArrivalTime =
                group.arrivalTime || assignments[0]?.arrivalTime || roleLines[0]?.arrivalTime || ''

              return (
                <div
                  key={group.id}
                  className={cn(
                    'rounded-lg border border-slate-200 bg-white',
                    compact ? 'mb-2 p-2' : 'mb-4 rounded-xl p-4'
                  )}
                >
                  {groups.length > 1 ? (
                    <div className="mb-1.5 flex justify-end">
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => removeGroup(group.id)}
                      >
                        Elimina grup
                      </button>
                    </div>
                  ) : null}

                  <div className={cn('overflow-x-auto', compact ? 'mb-1.5' : 'mb-3')}>
                    <div className="flex min-w-max items-center gap-1.5">
                      <Input
                        value={group.meetingPoint || ''}
                        onChange={(e) => updateGroup(group.id, { meetingPoint: e.target.value })}
                        className={cn(
                          'w-[8.5rem] min-w-0 shrink-0 px-2',
                          compact ? 'h-8 text-xs' : 'h-9 text-sm'
                        )}
                        placeholder="Lloc"
                        aria-label="Lloc concentració"
                      />
                      <Input
                        type="time"
                        value={group.startTime || ''}
                        onChange={(e) => updateGroup(group.id, { startTime: e.target.value })}
                        className={cn(
                          'w-[5.35rem] shrink-0 px-1.5 tabular-nums',
                          compact ? 'h-8 text-xs' : 'h-9 text-sm'
                        )}
                        aria-label="Hora inici esdeveniment"
                      />
                      <Input
                        type="time"
                        value={group.endTime || ''}
                        onChange={(e) => updateGroup(group.id, { endTime: e.target.value })}
                        className={cn(
                          'w-[5.35rem] shrink-0 px-1.5 tabular-nums',
                          compact ? 'h-8 text-xs' : 'h-9 text-sm'
                        )}
                        aria-label="Hora fi esdeveniment"
                      />
                      <Input
                        type="date"
                        value={group.serviceDate || eventStartDate}
                        onChange={(e) => updateGroup(group.id, { serviceDate: e.target.value })}
                        className={cn(
                          'w-[9rem] shrink-0 px-2',
                          compact ? 'h-8 text-xs' : 'h-9 text-sm'
                        )}
                        aria-label="Data servei"
                      />
                      <Input
                        type="time"
                        value={groupArrivalTime}
                        onChange={(e) => {
                          const value = e.target.value
                          updateGroup(
                            group.id,
                            patchGroup(
                              { ...group, arrivalTime: value },
                              (lines) => lines.map((entry) => ({ ...entry, arrivalTime: value }))
                            )
                          )
                        }}
                        className={cn(
                          'w-[5.35rem] shrink-0 px-1.5 tabular-nums',
                          compact ? 'h-8 text-xs' : 'h-9 text-sm'
                        )}
                        aria-label="Hora arribada"
                        title="Hora arribada"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateGroup(group.id, applyCuinaDefaultsToRoleLines(group))
                        }
                        className={cn(
                          'shrink-0 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-800 hover:bg-blue-100',
                          compact ? 'h-8' : 'h-9'
                        )}
                      >
                        Aplicar tot
                      </button>
                    </div>
                  </div>

                  <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
                    {roleLines.map((line) => {
                      const reservedForLine = buildReservedForRoleLine(
                        reservedPersonIds,
                        line,
                        cuinaTopBar?.manualResp || group.responsibleId
                      )
                      const lineAssignment = findCuinaAssignmentForLine(assignments, line)
                      const assignedVehicleIds = new Set(
                        [...allAssignedVehicleIds].filter(
                          (id) => id !== lineAssignment.vehicleId
                        )
                      )

                      return (
                        <CuinaGroupRoleLineRow
                          key={line.slotId}
                          line={line}
                          assignment={lineAssignment}
                          mode={mode}
                          responsables={availableResponsables}
                          conductors={availableConductors}
                          treballadors={availableTreballadors}
                          reservedPersonIds={reservedForLine}
                          availableVehicles={availableVehicles}
                          assignedVehicleIds={assignedVehicleIds}
                          canRemove={roleLines.length > 1}
                          compact={compact}
                          onLinePatch={(patch) =>
                            updateGroup(
                              group.id,
                              patchGroup(group, (lines) =>
                                lines.map((entry) =>
                                  entry.slotId === line.slotId ? { ...entry, ...patch } : entry
                                )
                              )
                            )
                          }
                          onLineRemove={() =>
                            updateGroup(
                              group.id,
                              patchGroup(group, (lines) =>
                                lines.filter((entry) => entry.slotId !== line.slotId)
                              )
                            )
                          }
                          onAssignmentPatch={(patch) =>
                            patchAssignmentForLine(group, line, patch)
                          }
                        />
                      )
                    })}
                  </div>

                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-2',
                      compact ? 'mt-2' : 'mt-3'
                    )}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(compact && 'h-7 px-2 text-xs')}
                      onClick={() =>
                        updateGroup(
                          group.id,
                          patchGroup(group, (lines) => [
                            ...lines,
                            createEmptyCuinaRoleLine(group, 'treballador'),
                          ])
                        )
                      }
                    >
                      + Persona
                    </Button>
                    {mode === 'manual' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          'border-slate-200 bg-white text-slate-900 shadow-sm',
                          compact && 'h-7 px-2 text-xs'
                        )}
                        onClick={() =>
                          updateGroup(
                            group.id,
                            patchGroup(group, (lines) => [
                              ...lines,
                              createCenterExternalExtraLine(group),
                            ])
                          )
                        }
                      >
                        + Extra centre
                      </Button>
                    ) : null}
                    {assignments.length > 0 ? (
                      <span className="text-[11px] text-slate-500">
                        Vehicles disponibles: {availableVehicleCount} / {availableVehicles.length}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(compact && 'h-7 px-2 text-xs')}
                  onClick={addGroup}
                >
                  + Grup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'border-slate-200 bg-white text-slate-900 shadow-sm',
                    compact && 'h-7 px-2 text-xs',
                    cuinaEtt.open && 'border-indigo-300 bg-indigo-50'
                  )}
                  onClick={toggleEtt}
                >
                  {cuinaEtt.open ? 'Amaga ETT' : '+ ETT'}
                </Button>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    'font-semibold uppercase tracking-wide text-slate-600',
                    compact ? 'text-[11px]' : 'text-xs'
                  )}
                >
                  Event
                </span>
                <PhaseUnifiedMarker
                  selected
                  visible
                  compact={compact}
                  onToggleSelection={() => undefined}
                  onToggleVisibility={() => undefined}
                />
              </div>
            </div>

            {cuinaEtt.open ? (
              <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 lg:grid-cols-[160px_170px_130px_130px_minmax(260px,1fr)] lg:items-end">
                  <div>
                    <Label>Treballadors ETT</Label>
                    <Input
                      type="number"
                      min={0}
                      value={cuinaEtt.data.workers}
                      onChange={(e) => updateEtt({ workers: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Data servei</Label>
                    <Input
                      type="date"
                      value={cuinaEtt.data.serviceDate}
                      onChange={(e) => updateEtt({ serviceDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora inici</Label>
                    <Input
                      type="time"
                      value={cuinaEtt.data.startTime}
                      onChange={(e) => updateEtt({ startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora fi</Label>
                    <Input
                      type="time"
                      value={cuinaEtt.data.endTime}
                      onChange={(e) => updateEtt({ endTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Lloc</Label>
                    <Input
                      value={cuinaEtt.data.meetingPoint}
                      onChange={(e) => updateEtt({ meetingPoint: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </>
        </PhaseCard>
      </div>
    </div>
  )
}
