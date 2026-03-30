"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

import {
  servicePhaseOptions,
  ServicePhaseKey,
  ServicePhaseSetting,
  ServeiGroup,
  ServiceJamoneroAssignment,
  ServicePhaseEtt,
  ServicePhaseEttData,
} from "../phaseConfig"
import PhaseCard from "./PhaseCard"

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
  settings: Record<ServicePhaseKey, ServicePhaseSetting>
  visibility: Record<ServicePhaseKey, boolean>
  ettState: Record<ServicePhaseKey, ServicePhaseEtt>
  manualResponsibleId: string
  availableResponsables: Array<{ id: string; name: string }>
  availableConductors: Array<{ id: string; name: string }>
  availableJamoneros: Array<{ id: string; name: string }>
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
}

export default function ServicePhasePanel({
  groups,
  totals,
  meetingPoint,
  eventStartDate,
  settings,
  visibility,
  ettState,
  manualResponsibleId,
  availableResponsables,
  availableConductors,
  availableJamoneros,
  jamoneroAssignments,
  setJamoneroCount,
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
}: Props) {
  const normalize = (value?: string) => String(value || "").trim().toLowerCase()
  const selectedManualJamoneroIds = new Set(
    jamoneroAssignments
      .filter((assignment) => assignment.mode === "manual")
      .map((assignment) => normalize(assignment.personnelId))
      .filter(Boolean)
  )

  void meetingPoint
  void manualResponsibleId
  void setManualResponsible
  void updateSetting

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Fase serveis</p>
          <p className="text-xs text-slate-500">
            Treballadors {totals.workers} · Conductors {totals.drivers} · Fases {totals.responsables}
          </p>
          {totals.jamoneros > 0 && (
            <p className="text-xs text-amber-700">Jamoneros {totals.jamoneros}</p>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="grid gap-3 lg:grid-cols-[140px_minmax(0,1fr)] lg:items-start">
          <div>
            <Label>Jamoneros event</Label>
            <Input
              type="number"
              min={0}
              value={jamoneroAssignments.length}
              onChange={(e) =>
                setJamoneroCount(
                  Number.isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value))
                )
              }
            />
          </div>
          {jamoneroAssignments.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {jamoneroAssignments.map((assignment, index) => (
                <div key={assignment.id}>
                  <Label>Jamonero {index + 1}</Label>
                  <Select
                    value={
                      assignment.mode === "manual" && assignment.personnelId
                        ? assignment.personnelId
                        : "__auto__"
                    }
                    onValueChange={(value) =>
                      updateJamoneroAssignment(assignment.id, {
                        mode: value === "__auto__" ? "auto" : "manual",
                        personnelId: value === "__auto__" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Automàtic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Automàtic</SelectItem>
                      {availableJamoneros
                        .filter(
                          (person) =>
                            normalize(person.id) === normalize(assignment.personnelId) ||
                            !selectedManualJamoneroIds.has(normalize(person.id))
                        )
                        .map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-3">
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
              description="Activar per generar aquesta fase"
              selected={isSelected}
              visible={isVisible}
              onToggleSelection={() => toggleSelection(phase.key)}
              onToggleVisibility={() => toggleVisibility(phase.key)}
            >
              {showPhaseContent ? (
                <>
                  {groupsForPhase.map((group, idx) => {
                    const selectedElsewhere = new Set(
                      groups
                        .filter((candidate) => candidate.id !== group.id)
                        .map((candidate) => normalize(candidate.driverId))
                        .filter(Boolean)
                    )

                    const conductorsForGroup = availableConductors.filter(
                      (conductor) =>
                        normalize(conductor.id) === normalize(group.driverId) ||
                        !selectedElsewhere.has(normalize(conductor.id))
                    )

                    return (
                      <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
                          <span>Grup {idx + 1}</span>
                          {groupsForPhase.length > 1 && (
                            <button
                              type="button"
                              className="text-red-500 hover:underline"
                              onClick={() => removeGroup(group.id, phase.key)}
                            >
                              Elimina grup
                            </button>
                          )}
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[64px_minmax(220px,1fr)_64px_minmax(220px,1fr)_120px_minmax(220px,1fr)_130px_130px_170px] lg:items-end">
                          <div className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                            <Switch
                              id={`needs-responsible-${group.id}`}
                              checked={group.wantsResponsible}
                              onCheckedChange={(checked) =>
                                updateGroup(group.id, {
                                  wantsResponsible: Boolean(checked),
                                  responsibleId: checked ? group.responsibleId : "",
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label>Responsable</Label>
                            {group.wantsResponsible ? (
                              <Select
                                value={group.responsibleId || "__auto__"}
                                onValueChange={(value) =>
                                  updateGroup(group.id, {
                                    wantsResponsible: value !== "__none__",
                                    responsibleId:
                                      value === "__auto__" || value === "__none__" ? "" : value,
                                  })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Responsable de la fase..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__auto__">Automàtic</SelectItem>
                                  <SelectItem value="__none__">Sense responsable</SelectItem>
                                  {availableResponsables.map((resp) => (
                                    <SelectItem key={resp.id} value={resp.id}>
                                      {resp.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex h-10 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-400">
                                Sense responsable
                              </div>
                            )}
                          </div>

                          <div className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                            <Switch
                              id={`needs-driver-${group.id}`}
                              checked={group.needsDriver}
                              onCheckedChange={(checked) =>
                                updateGroup(group.id, {
                                  needsDriver: Boolean(checked),
                                  driverId: checked ? group.driverId : "",
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label>Conductor</Label>
                            {group.needsDriver ? (
                              <Select
                                value={group.driverId || "__none__"}
                                onValueChange={(value) =>
                                  updateGroup(group.id, { driverId: value === "__none__" ? "" : value })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Selecciona un conductor..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Sense assignar</SelectItem>
                                  {conductorsForGroup.map((conductor) => (
                                    <SelectItem key={conductor.id} value={conductor.id}>
                                      {conductor.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex h-10 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-400">
                                Sense conductor
                              </div>
                            )}
                          </div>
                          <div>
                            <Label>Treballadors</Label>
                            <Input
                              type="number"
                              min={0}
                              max={4}
                              value={group.workers}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  workers: Number.isNaN(Number(e.target.value))
                                    ? 0
                                    : Math.min(4, Number(e.target.value)),
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label>Meeting point</Label>
                            <Input
                              value={group.meetingPoint}
                              onChange={(e) => updateGroup(group.id, { meetingPoint: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Hora inici</Label>
                            <Input
                              type="time"
                              value={group.startTime}
                              onChange={(e) => updateGroup(group.id, { startTime: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Hora fi</Label>
                            <Input
                              type="time"
                              value={group.endTime}
                              onChange={(e) => updateGroup(group.id, { endTime: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Data servei</Label>
                            <Input
                              type="date"
                              value={group.serviceDate}
                              onChange={(e) => updateGroup(group.id, { serviceDate: e.target.value })}
                            />
                          </div>
                        </div>

                        {group.serviceDate !== eventStartDate && (
                          <div className="mt-3 lg:max-w-md">
                            <Label>Nota del dia</Label>
                            <Input
                              type="text"
                              placeholder="Muntatge"
                              value={group.dateLabel}
                              onChange={(e) => updateGroup(group.id, { dateLabel: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => addGroup(phase.key)}>
                      + Grup
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 bg-white text-slate-900 shadow-sm"
                      onClick={() => toggleEtt(phase.key)}
                    >
                      {phaseEtt?.open ? "Amaga ETT" : "+ ETT"}
                    </Button>
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
                  ) : (
                    <p className="text-xs text-slate-500">
                      ETT · {phaseEtt?.data.workers || "0"} treballadors
                    </p>
                  )}
                </>
              ) : null}
            </PhaseCard>
          )
        })}
      </div>
    </div>
  )
}
