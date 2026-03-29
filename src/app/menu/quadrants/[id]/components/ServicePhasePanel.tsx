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
  ServicePhaseEtt,
  ServicePhaseEttData,
} from "../phaseConfig"
import PhaseCard from "./PhaseCard"

type Totals = {
  workers: number
  drivers: number
  responsables: number
}

type Props = {
  groups: ServeiGroup[]
  totals: Totals
  meetingPoint: string
  eventStartDate: string
  settings: Record<ServicePhaseKey, ServicePhaseSetting>
  visibility: Record<ServicePhaseKey, boolean>
  ettState: Record<ServicePhaseKey, ServicePhaseEtt>
  availableConductors: Array<{ id: string; name: string }>
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
  availableConductors,
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

  void meetingPoint

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Fase serveis</p>
          <p className="text-xs text-slate-500">
            Treballadors {totals.workers} · Conductors {totals.drivers} · Fases {totals.responsables}
          </p>
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
                  {phase.key === 'event' && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <Switch
                        id={`needs-responsible-${phase.key}`}
                        checked={settings[phase.key]?.needsResponsible ?? true}
                        onCheckedChange={(checked) =>
                          updateSetting(phase.key, { needsResponsible: Boolean(checked) })
                        }
                      />
                      <Label htmlFor={`needs-responsible-${phase.key}`} className="mb-0">
                        Necessita responsable?
                      </Label>
                    </div>
                  )}
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
                      <div
                        key={group.id}
                        className="border border-slate-200 rounded-xl bg-white p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500">
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

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label>Data servei</Label>
                            <Input
                              type="date"
                              value={group.serviceDate}
                              onChange={(e) => updateGroup(group.id, { serviceDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Meeting point</Label>
                            <Input
                              value={group.meetingPoint}
                              onChange={(e) => updateGroup(group.id, { meetingPoint: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
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
                        </div>

                        {group.serviceDate !== eventStartDate && (
                          <div>
                            <Label>Nota del dia</Label>
                            <Input
                              type="text"
                              placeholder="Muntatge"
                              value={group.dateLabel}
                              onChange={(e) => updateGroup(group.id, { dateLabel: e.target.value })}
                            />
                          </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label>Treballadors</Label>
                            <Input
                              type="number"
                              min={0}
                              value={group.workers}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  workers: Number.isNaN(Number(e.target.value))
                                    ? 0
                                    : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
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
                              <Label htmlFor={`needs-driver-${group.id}`} className="mb-0">
                                Necessita conductor?
                              </Label>
                            </div>
                            {group.needsDriver && (
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
                            )}
                          </div>
                        </div>
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
                      className="text-slate-900 border-slate-200 bg-white shadow-sm"
                      onClick={() => toggleEtt(phase.key)}
                    >
                      {phaseEtt?.open ? "Amaga ETT" : "+ ETT"}
                    </Button>
                  </div>

                  {phaseEtt?.open ? (
                    <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Data servei</Label>
                          <Input
                            type="date"
                            value={phaseEtt.data.serviceDate}
                            onChange={(e) => updateEtt(phase.key, { serviceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Meeting point</Label>
                          <Input
                            value={phaseEtt.data.meetingPoint}
                            onChange={(e) => updateEtt(phase.key, { meetingPoint: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
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
                      </div>
                      <div>
                        <Label>Treballadors ETT</Label>
                        <Input
                          type="number"
                          min={0}
                          value={phaseEtt.data.workers}
                          onChange={(e) => updateEtt(phase.key, { workers: e.target.value })}
                        />
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
