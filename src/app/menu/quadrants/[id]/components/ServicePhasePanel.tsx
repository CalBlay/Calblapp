"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import {
  servicePhaseOptions,
  ServicePhaseKey,
  ServicePhaseSetting,
  ServeiGroup,
  ServiceJamoneroAssignment,
  ServicePhaseEtt,
  ServicePhaseEttData,
} from "../phaseConfig"
import PhaseCard, { PhaseUnifiedMarker } from "./PhaseCard"
import QuadrantTopBarServeis from "./QuadrantTopBarServeis"
import ServiceGroupRoleLineRow from "./ServiceGroupRoleLineRow"
import {
  applyGroupDefaultsToRoleLines,
  createEmptyRoleLine,
  ensureGroupRoleLines,
  patchGroupRoleLines,
} from "../lib/serviceGroupRoleLines"
import type { ResponsableAvailabilityOption } from "../hooks/useQuadrantFormState"
import type { DriverCrewPremise } from "@/services/premises"
import type { ComponentProps } from "react"
import { getCrewMembersForDriver } from "@/lib/driverCrewUtils"

type ServeisTopBarProps = Omit<ComponentProps<typeof QuadrantTopBarServeis>, "embedded">

type Totals = {
  workers: number
  drivers: number
  responsables: number
  jamoneros: number
}

type Props = {
  groups: ServeiGroup[]
  totals: Totals
  meetingPoint: string
  eventStartDate: string
  mode?: 'auto' | 'semi' | 'manual'
  compact?: boolean
  settings: Record<ServicePhaseKey, ServicePhaseSetting>
  visibility: Record<ServicePhaseKey, boolean>
  ettState: Record<ServicePhaseKey, ServicePhaseEtt>
  manualResponsibleId: string
  availableResponsables: ResponsableAvailabilityOption[]
  availableConductors: Array<{ id: string; name: string }>
  availableJamoneros: Array<{ id: string; name: string }>
  availableTreballadors?: Array<{ id: string; name: string }>
  driverCrews?: DriverCrewPremise[]
  jamoneroAssignments: ServiceJamoneroAssignment[]
  setJamoneroCount: (count: number) => void
  updateJamoneroAssignment: (id: string, patch: Partial<ServiceJamoneroAssignment>) => void
  setManualResponsible: (value: string) => void
  toggleSelection: (key: ServicePhaseKey) => void
  updateSetting: (key: ServicePhaseKey, patch: Partial<ServicePhaseSetting>) => void
  toggleVisibility: (key: ServicePhaseKey) => void
  addGroup: (phaseKey: ServicePhaseKey) => void
  removeGroup: (id: string, phaseKey: ServicePhaseKey) => void
  updateGroup: (id: string, patch: Partial<ServeiGroup>) => void
  toggleEtt: (key: ServicePhaseKey) => void
  updateEtt: (key: ServicePhaseKey, patch: Partial<ServicePhaseEttData>) => void
  serveisTopBar?: ServeisTopBarProps
}

export default function ServicePhasePanel({
  groups,
  totals: _totals,
  meetingPoint,
  eventStartDate,
  mode = 'semi',
  compact = false,
  settings,
  visibility,
  ettState,
  manualResponsibleId,
  availableResponsables,
  availableConductors,
  availableJamoneros,
  availableTreballadors = [],
  driverCrews = [],
  jamoneroAssignments,
  setJamoneroCount: _setJamoneroCount,
  updateJamoneroAssignment,
  setManualResponsible,
  toggleSelection,
  updateSetting,
  toggleVisibility,
  addGroup,
  removeGroup,
  updateGroup,
  toggleEtt,
  updateEtt,
  serveisTopBar,
}: Props) {
  const normalize = (value?: string) => String(value || "").trim().toLowerCase()
  void meetingPoint
  void setManualResponsible
  void manualResponsibleId
  void updateSetting
  void _setJamoneroCount
  void availableJamoneros
  void jamoneroAssignments
  void updateJamoneroAssignment

  const treballadorOptions = availableTreballadors.map((person) => ({
    ...person,
    isJamonero:
      availableJamoneros.some((j) => j.id === person.id) ||
      ('isJamonero' in person && person.isJamonero === true),
  }))

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
        compact && 'rounded-lg shadow-none'
      )}
    >
      {serveisTopBar ? <QuadrantTopBarServeis {...serveisTopBar} embedded /> : null}
      <div className={compact ? 'space-y-2 p-2' : 'space-y-4 p-4'}>
        {servicePhaseOptions.map((phase) => {
          const groupsForPhase = groups.filter((g) => g.phaseKey === phase.key)
          if (!groupsForPhase.length) return null

          const isSelected = settings[phase.key]?.selected ?? true
          const isVisible = visibility[phase.key] ?? true
          const phaseEtt = ettState[phase.key]
          const showPhaseContent = isVisible && isSelected

          return (
            <PhaseCard
              key={phase.key}
              label={phase.label}
              selected={isSelected}
              visible={isVisible}
              compact={compact}
              hideHeaderLabel
              unifiedMarker
              onToggleSelection={() => toggleSelection(phase.key)}
              onToggleVisibility={() => toggleVisibility(phase.key)}
            >
              {showPhaseContent ? (
                <>
                  {groupsForPhase.map((group) => {
                    const roleLines = ensureGroupRoleLines(group)
                    const reservedPersonIds = new Set(
                      roleLines
                        .map((line) => normalize(line.personId))
                        .filter(Boolean)
                    )
                    const conductorLine = roleLines.find((line) => line.role === 'conductor')
                    const crewMembers = getCrewMembersForDriver(
                      conductorLine?.personId,
                      conductorLine?.personName,
                      driverCrews
                    )

                    return (
                      <div
                        key={group.id}
                        className={cn(
                          'rounded-lg border border-slate-200 bg-white',
                          compact ? 'p-2' : 'rounded-xl p-4'
                        )}
                      >
                        {groupsForPhase.length > 1 ? (
                          <div className="mb-1.5 flex justify-end">
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:underline"
                              onClick={() => removeGroup(group.id, phase.key)}
                            >
                              Elimina grup
                            </button>
                          </div>
                        ) : null}

                        <div className={cn("overflow-x-auto", compact ? "mb-1.5" : "mb-3")}>
                          <div className="flex min-w-max items-center gap-1.5">
                            <Input
                              value={group.meetingPoint}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  meetingPoint: e.target.value,
                                })
                              }
                              className={cn(
                                "w-[8.5rem] min-w-0 shrink-0 px-2",
                                compact ? "h-8 text-xs" : "h-9 text-sm"
                              )}
                              placeholder="Lloc"
                              aria-label="Meeting point del grup"
                            />
                            <Input
                              type="time"
                              value={group.startTime}
                              onChange={(e) => updateGroup(group.id, { startTime: e.target.value })}
                              className={cn(
                                "w-[5.35rem] shrink-0 px-1.5 tabular-nums",
                                compact ? "h-8 text-xs" : "h-9 text-sm"
                              )}
                              aria-label="Hora inici del grup"
                            />
                            <Input
                              type="time"
                              value={group.endTime}
                              onChange={(e) => updateGroup(group.id, { endTime: e.target.value })}
                              className={cn(
                                "w-[5.35rem] shrink-0 px-1.5 tabular-nums",
                                compact ? "h-8 text-xs" : "h-9 text-sm"
                              )}
                              aria-label="Hora fi del grup"
                            />
                            <Input
                              type="date"
                              value={group.serviceDate}
                              onChange={(e) => updateGroup(group.id, { serviceDate: e.target.value })}
                              className={cn(
                                "w-[9rem] shrink-0 px-2",
                                compact ? "h-8 text-xs" : "h-9 text-sm"
                              )}
                              aria-label="Data servei del grup"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateGroup(group.id, applyGroupDefaultsToRoleLines(group))
                              }
                              className={cn(
                                "shrink-0 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-800 hover:bg-blue-100",
                                compact ? "h-8" : "h-9"
                              )}
                            >
                              Aplicar tot
                            </button>
                          </div>
                        </div>

                        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
                          {roleLines.map((line) => {
                            const reservedForLine = new Set(
                              [...reservedPersonIds].filter((id) => id !== normalize(line.personId))
                            )
                            return (
                              <ServiceGroupRoleLineRow
                                key={line.slotId}
                                line={line}
                                mode={mode}
                                responsables={availableResponsables}
                                conductors={availableConductors}
                                treballadors={treballadorOptions}
                                crewMembers={crewMembers}
                                reservedPersonIds={reservedForLine}
                                canRemove={roleLines.length > 1}
                                onPatch={(patch) =>
                                  updateGroup(
                                    group.id,
                                    patchGroupRoleLines(group, (lines) =>
                                      lines.map((entry) =>
                                        entry.slotId === line.slotId ? { ...entry, ...patch } : entry
                                      )
                                    )
                                  )
                                }
                                onRemove={() =>
                                  updateGroup(
                                    group.id,
                                    patchGroupRoleLines(group, (lines) =>
                                      lines.filter((entry) => entry.slotId !== line.slotId)
                                    )
                                  )
                                }
                              />
                            )
                          })}
                        </div>

                        <div className={compact ? 'mt-2' : 'mt-3'}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateGroup(
                                group.id,
                                patchGroupRoleLines(group, (lines) => [
                                  ...lines,
                                  createEmptyRoleLine(group),
                                ])
                              )
                            }
                          >
                            + Persona
                          </Button>
                        </div>

                        {group.serviceDate !== eventStartDate ? (
                          <div className="mt-3 lg:max-w-md">
                            <Label>Nota del dia</Label>
                            <Input
                              type="text"
                              placeholder="Muntatge"
                              value={group.dateLabel}
                              onChange={(e) => updateGroup(group.id, { dateLabel: e.target.value })}
                            />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(compact && 'h-7 px-2 text-xs')}
                        onClick={() => addGroup(phase.key)}
                      >
                        + Grup
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'border-slate-200 bg-white text-slate-900 shadow-sm',
                          compact && 'h-7 px-2 text-xs',
                          phaseEtt?.open && 'border-indigo-300 bg-indigo-50'
                        )}
                        onClick={() => toggleEtt(phase.key)}
                      >
                        {phaseEtt?.open ? 'Amaga ETT' : '+ ETT'}
                      </Button>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'font-semibold uppercase tracking-wide text-slate-600',
                          compact ? 'text-[11px]' : 'text-xs'
                        )}
                      >
                        {phase.label}
                      </span>
                      <PhaseUnifiedMarker
                        selected={isSelected}
                        visible={isVisible}
                        compact={compact}
                        onToggleSelection={() => toggleSelection(phase.key)}
                        onToggleVisibility={() => toggleVisibility(phase.key)}
                      />
                    </div>
                  </div>

                  {phaseEtt?.open ? (
                    <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 lg:grid-cols-[160px_170px_170px_130px_130px_minmax(260px,1fr)] lg:items-end">
                        <div>
                          <Label>Treballadors ETT</Label>
                          <Input
                            type="number"
                            min={0}
                            value={phaseEtt.data.workers}
                            onChange={(e) => updateEtt(phase.key, { workers: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Data inici</Label>
                          <Input
                            type="date"
                            value={phaseEtt.data.serviceDate}
                            onChange={(e) => updateEtt(phase.key, { serviceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Data fi</Label>
                          <Input
                            type="date"
                            value={phaseEtt.data.serviceDate}
                            onChange={(e) => updateEtt(phase.key, { serviceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Hora inici</Label>
                          <Input
                            type="time"
                            value={phaseEtt.data.startTime}
                            onChange={(e) => updateEtt(phase.key, { startTime: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Hora fi</Label>
                          <Input
                            type="time"
                            value={phaseEtt.data.endTime}
                            onChange={(e) => updateEtt(phase.key, { endTime: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Lloc</Label>
                          <Input
                            value={phaseEtt.data.meetingPoint}
                            onChange={(e) => updateEtt(phase.key, { meetingPoint: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </PhaseCard>
          )
        })}
      </div>
    </div>
  )
}
