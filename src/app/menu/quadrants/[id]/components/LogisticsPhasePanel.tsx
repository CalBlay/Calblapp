"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  logisticPhaseOptions,
  AvailableConductor,
  LogisticPhaseKey,
  LogisticPhaseForm,
  LogisticPhaseSetting,
  VehicleAssignment,
  AvailableVehicle,
  ServicePhaseEttData,
} from "../phaseConfig"
import PhaseCard, { PhaseUnifiedMarker } from "./PhaseCard"
import QuadrantTopBarLogistica from "./QuadrantTopBarLogistica"
import LogisticRoleLineRow from "./LogisticRoleLineRow"
import {
  applyLogisticDefaultsToRoleLines,
  createEmptyLogisticRoleLine,
  ensureLogisticRoleLines,
  findAssignmentForLine,
  patchLogisticRoleLines,
} from "../lib/logisticPhaseRoleLines"
import { buildReservedForRoleLine } from "../lib/quadrantPayloadShared"
import type { ResponsableAvailabilityOption } from "../hooks/useQuadrantFormState"
import type { ComponentProps } from "react"

type LogisticaTopBarProps = Omit<ComponentProps<typeof QuadrantTopBarLogistica>, "embedded">

type Props = {
  phaseForms: Record<LogisticPhaseKey, LogisticPhaseForm>
  phaseSettings: Record<LogisticPhaseKey, LogisticPhaseSetting>
  phaseVisibility: Record<LogisticPhaseKey, boolean>
  phaseVehicleAssignments: Record<LogisticPhaseKey, VehicleAssignment[]>
  availableVehicles: AvailableVehicle[]
  availableConductors: AvailableConductor[]
  availableResponsables: ResponsableAvailabilityOption[]
  availableTreballadors?: Array<{ id: string; name: string }>
  togglePhaseVisibility: (key: LogisticPhaseKey) => void
  updatePhaseForm: (key: LogisticPhaseKey, patch: Partial<LogisticPhaseForm>) => void
  updatePhaseSetting: (key: LogisticPhaseKey, patch: Partial<LogisticPhaseSetting>) => void
  updatePhaseVehicleAssignment: (
    key: LogisticPhaseKey,
    index: number,
    patch: Partial<VehicleAssignment>
  ) => void
  replacePhaseVehicleAssignments: (key: LogisticPhaseKey, assignments: VehicleAssignment[]) => void
  ettOpen: boolean
  ettData: ServicePhaseEttData
  toggleEtt: () => void
  updateEtt: (patch: Partial<ServicePhaseEttData>) => void
  mode?: "auto" | "semi" | "manual"
  compact?: boolean
  logisticaTopBar?: LogisticaTopBarProps
}

export default function LogisticsPhasePanel({
  phaseForms,
  phaseSettings,
  phaseVisibility,
  phaseVehicleAssignments,
  availableVehicles,
  availableConductors,
  availableResponsables,
  availableTreballadors = [],
  togglePhaseVisibility,
  updatePhaseForm,
  updatePhaseSetting,
  updatePhaseVehicleAssignment,
  replacePhaseVehicleAssignments,
  ettOpen,
  ettData,
  toggleEtt,
  updateEtt,
  mode = "semi",
  compact = false,
  logisticaTopBar,
}: Props) {
  const normalize = (value?: string) => String(value || "").trim().toLowerCase()

  const assignedVehicleIds = new Set(
    Object.values(phaseVehicleAssignments)
      .flat()
      .map((assign) => assign.vehicleId)
      .filter(Boolean)
  )

  const availableVehicleCount = availableVehicles.filter((vehicle) => vehicle.available).length

  const togglePhaseSelection = (key: LogisticPhaseKey) => {
    const current = phaseSettings[key]?.selected ?? true
    updatePhaseSetting(key, { selected: !current })
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        compact && "rounded-lg shadow-none"
      )}
    >
      {logisticaTopBar ? <QuadrantTopBarLogistica {...logisticaTopBar} embedded /> : null}

      <div className={compact ? "space-y-2 p-2" : "space-y-4 p-4"}>
        {logisticPhaseOptions.map((phase) => {
          const form = phaseForms[phase.key]
          const settings = phaseSettings[phase.key]
          const visible = phaseVisibility[phase.key]
          const assignments = phaseVehicleAssignments[phase.key] ?? []
          const isSelected = settings?.selected ?? true
          const isVisible = visible ?? true
          const showPhaseContent = isVisible && isSelected
          const roleLines = ensureLogisticRoleLines(form, assignments)
          const phaseArrivalTime =
            form?.arrivalTime || assignments[0]?.arrivalTime || roleLines[0]?.arrivalTime || ""
          const reservedPersonIds = new Set<string>()

          logisticPhaseOptions.forEach((otherPhase) => {
            if (otherPhase.key === phase.key) return
            ensureLogisticRoleLines(phaseForms[otherPhase.key], phaseVehicleAssignments[otherPhase.key] || []).forEach((line) => {
              const pid = normalize(line.personId)
              if (pid) reservedPersonIds.add(pid)
            })
          })
          roleLines.forEach((line) => {
            const pid = normalize(line.personId)
            if (pid) reservedPersonIds.add(pid)
          })
          const manualRespId = normalize(logisticaTopBar?.manualResp)
          if (
            manualRespId &&
            manualRespId !== "__auto__" &&
            manualRespId !== "__manual_pick__"
          ) {
            reservedPersonIds.add(manualRespId)
          }

          const applyGroupDefaults = () => {
            const { formPatch, assignments: nextAssignments } = patchLogisticRoleLines(
              form,
              assignments,
              (lines) => applyLogisticDefaultsToRoleLines(form, lines)
            )
            updatePhaseForm(phase.key, formPatch)
            replacePhaseVehicleAssignments(phase.key, nextAssignments)
          }

          const applyRoleLines = (
            updater: (lines: ReturnType<typeof ensureLogisticRoleLines>) => ReturnType<typeof ensureLogisticRoleLines>
          ) => {
            const { formPatch, assignments: nextAssignments } = patchLogisticRoleLines(
              form,
              assignments,
              updater
            )
            updatePhaseForm(phase.key, formPatch)
            replacePhaseVehicleAssignments(phase.key, nextAssignments)
          }

          const patchAssignmentForLine = (
            line: (typeof roleLines)[number],
            patch: Partial<VehicleAssignment>
          ) => {
            const idx = assignments.findIndex((entry) => entry.slotId === line.slotId)
            if (idx < 0) {
              const next = [...assignments, { ...findAssignmentForLine(assignments, line), ...patch }]
              replacePhaseVehicleAssignments(phase.key, next)
              return
            }
            updatePhaseVehicleAssignment(phase.key, idx, patch)
          }

          return (
            <PhaseCard
              key={phase.key}
              label={phase.label}
              selected={isSelected}
              visible={isVisible}
              compact={compact}
              hideHeaderLabel
              unifiedMarker
              onToggleSelection={() => togglePhaseSelection(phase.key)}
              onToggleVisibility={() => togglePhaseVisibility(phase.key)}
            >
              {showPhaseContent ? (
                <>
                  <div
                    className={cn(
                      "rounded-lg border border-slate-200 bg-white",
                      compact ? "p-2" : "rounded-xl p-4"
                    )}
                  >
                    <div className={cn("overflow-x-auto", compact ? "mb-1.5" : "mb-3")}>
                      <div className="flex min-w-max items-center gap-1.5">
                        <Input
                          value={form?.meetingPoint || ""}
                          onChange={(e) =>
                            updatePhaseForm(phase.key, { meetingPoint: e.target.value })
                          }
                          className={cn(
                            "w-[8.5rem] min-w-0 shrink-0 px-2",
                            compact ? "h-8 text-xs" : "h-9 text-sm"
                          )}
                          placeholder="Lloc"
                          aria-label="Lloc concentració"
                        />
                        <Input
                          type="time"
                          value={form?.startTime || ""}
                          onChange={(e) =>
                            updatePhaseForm(phase.key, { startTime: e.target.value })
                          }
                          className={cn(
                            "w-[5.35rem] shrink-0 px-1.5 tabular-nums",
                            compact ? "h-8 text-xs" : "h-9 text-sm"
                          )}
                          aria-label="Hora inici esdeveniment"
                        />
                        <Input
                          type="time"
                          value={form?.endTime || ""}
                          onChange={(e) =>
                            updatePhaseForm(phase.key, { endTime: e.target.value })
                          }
                          className={cn(
                            "w-[5.35rem] shrink-0 px-1.5 tabular-nums",
                            compact ? "h-8 text-xs" : "h-9 text-sm"
                          )}
                          aria-label="Hora fi esdeveniment"
                        />
                        <Input
                          type="date"
                          value={form?.startDate || ""}
                          onChange={(e) =>
                            updatePhaseForm(phase.key, { startDate: e.target.value })
                          }
                          className={cn(
                            "w-[9rem] shrink-0 px-2",
                            compact ? "h-8 text-xs" : "h-9 text-sm"
                          )}
                          aria-label="Data inici"
                        />
                        <Input
                          type="date"
                          value={form?.endDate || ""}
                          onChange={(e) =>
                            updatePhaseForm(phase.key, { endDate: e.target.value })
                          }
                          className={cn(
                            "w-[9rem] shrink-0 px-2",
                            compact ? "h-8 text-xs" : "h-9 text-sm"
                          )}
                          aria-label="Data fi"
                        />
                        <Input
                          type="time"
                          value={phaseArrivalTime}
                          onChange={(e) => {
                            const value = e.target.value
                            updatePhaseForm(phase.key, { arrivalTime: value })
                            applyRoleLines((lines) =>
                              lines.map((entry) => ({ ...entry, arrivalTime: value }))
                            )
                          }}
                          className={cn(
                            "w-[5.35rem] shrink-0 px-1.5 tabular-nums",
                            compact ? "h-8 text-xs" : "h-9 text-sm"
                          )}
                          aria-label="Hora arribada"
                          title="Hora arribada"
                        />
                        <button
                          type="button"
                          onClick={applyGroupDefaults}
                          className={cn(
                            "shrink-0 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-800 hover:bg-blue-100",
                            compact ? "h-8" : "h-9"
                          )}
                        >
                          Aplicar tot
                        </button>
                      </div>
                    </div>

                    <div className={compact ? "space-y-1.5" : "space-y-2"}>
                      {roleLines.map((line) => {
                        const reservedForLine = buildReservedForRoleLine(
                          reservedPersonIds,
                          line,
                          logisticaTopBar?.manualResp
                        )
                        const lineAssignment = findAssignmentForLine(assignments, line)
                        return (
                          <LogisticRoleLineRow
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
                              applyRoleLines((lines) =>
                                lines.map((entry) =>
                                  entry.slotId === line.slotId ? { ...entry, ...patch } : entry
                                )
                              )
                            }
                            onLineRemove={() =>
                              applyRoleLines((lines) =>
                                lines.filter((entry) => entry.slotId !== line.slotId)
                              )
                            }
                            onAssignmentPatch={(patch) => patchAssignmentForLine(line, patch)}
                          />
                        )
                      })}
                    </div>

                    <div className={cn("flex flex-wrap items-center gap-2", compact ? "mt-2" : "mt-3")}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(compact && "h-7 px-2 text-xs")}
                        onClick={() =>
                          applyRoleLines((lines) => [
                            ...lines,
                            createEmptyLogisticRoleLine(form, 'treballador'),
                          ])
                        }
                      >
                        + Persona
                      </Button>
                      {assignments.length > 0 ? (
                        <span className="text-[11px] text-slate-500">
                          Vehicles disponibles: {availableVehicleCount} / {availableVehicles.length}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {phase.key === "event" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "border-slate-200 bg-white text-slate-900 shadow-sm",
                            compact && "h-7 px-2 text-xs",
                            ettOpen && "border-indigo-300 bg-indigo-50"
                          )}
                          onClick={toggleEtt}
                        >
                          {ettOpen ? "Amaga ETT" : "+ ETT"}
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "font-semibold uppercase tracking-wide text-slate-600",
                          compact ? "text-[11px]" : "text-xs"
                        )}
                      >
                        {phase.label}
                      </span>
                      <PhaseUnifiedMarker
                        selected={isSelected}
                        visible={isVisible}
                        compact={compact}
                        onToggleSelection={() => togglePhaseSelection(phase.key)}
                        onToggleVisibility={() => togglePhaseVisibility(phase.key)}
                      />
                    </div>
                  </div>

                  {phase.key === "event" && ettOpen ? (
                    <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 lg:grid-cols-[160px_170px_170px_130px_130px_minmax(260px,1fr)] lg:items-end">
                        <div>
                          <Label>Treballadors ETT</Label>
                          <Input
                            type="number"
                            min={0}
                            value={ettData.workers}
                            onChange={(e) => updateEtt({ workers: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Data inici</Label>
                          <Input
                            type="date"
                            value={ettData.serviceDate}
                            onChange={(e) => updateEtt({ serviceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Data fi</Label>
                          <Input
                            type="date"
                            value={ettData.serviceDate}
                            onChange={(e) => updateEtt({ serviceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Hora inici</Label>
                          <Input
                            type="time"
                            value={ettData.startTime}
                            onChange={(e) => updateEtt({ startTime: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Hora fi</Label>
                          <Input
                            type="time"
                            value={ettData.endTime}
                            onChange={(e) => updateEtt({ endTime: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Lloc</Label>
                          <Input
                            value={ettData.meetingPoint}
                            onChange={(e) => updateEtt({ meetingPoint: e.target.value })}
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
