"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportType,
} from "@/lib/transportTypes"
import { canDriverHandleVehicleType } from "@/lib/driverCapabilities"
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
import PhaseCard from "./PhaseCard"

type Props = {
  phaseForms: Record<LogisticPhaseKey, LogisticPhaseForm>
  phaseSettings: Record<LogisticPhaseKey, LogisticPhaseSetting>
  phaseVisibility: Record<LogisticPhaseKey, boolean>
  phaseResponsibles: Record<LogisticPhaseKey, string>
  phaseVehicleAssignments: Record<LogisticPhaseKey, VehicleAssignment[]>
  availableVehicles: AvailableVehicle[]
  availableConductors: AvailableConductor[]
  availableResponsables: Array<{ id: string; name: string }>
  togglePhaseVisibility: (key: LogisticPhaseKey) => void
  updatePhaseForm: (key: LogisticPhaseKey, patch: Partial<LogisticPhaseForm>) => void
  updatePhaseSetting: (key: LogisticPhaseKey, patch: Partial<LogisticPhaseSetting>) => void
  updatePhaseResponsible: (key: LogisticPhaseKey, value: string) => void
  updatePhaseVehicleAssignment: (
    key: LogisticPhaseKey,
    index: number,
    patch: Partial<VehicleAssignment>
  ) => void
  ettOpen: boolean
  ettData: ServicePhaseEttData
  toggleEtt: () => void
  updateEtt: (patch: Partial<ServicePhaseEttData>) => void
}

export default function LogisticsPhasePanel({
  phaseForms,
  phaseSettings,
  phaseVisibility,
  phaseResponsibles,
  phaseVehicleAssignments,
  availableVehicles,
  availableConductors,
  availableResponsables,
  togglePhaseVisibility,
  updatePhaseForm,
  updatePhaseSetting,
  updatePhaseResponsible,
  updatePhaseVehicleAssignment,
  ettOpen,
  ettData,
  toggleEtt,
  updateEtt,
}: Props) {
  const assignedVehicleIds = new Set(
    Object.values(phaseVehicleAssignments)
      .flat()
      .map((assign) => assign.vehicleId)
      .filter(Boolean)
  )

  const availableVehicleCount = availableVehicles.filter((v) => v.available).length

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-700">Fase logistica</p>
      <div className="grid gap-3">
        {logisticPhaseOptions.map((phase) => {
          const form = phaseForms[phase.key]
          const settings = phaseSettings[phase.key]
          const visible = phaseVisibility[phase.key]
          const assignments = phaseVehicleAssignments[phase.key] ?? []
          const showsResponsibleControls = phase.key === "event"
          const sharedArrivalTime = assignments[0]?.arrivalTime || ""

          return (
            <PhaseCard
              key={phase.key}
              label={phase.label}
              description="Activar per generar aquesta fase"
              selected={settings?.selected ?? true}
              visible={visible}
              onToggleSelection={() =>
                updatePhaseSetting(phase.key, {
                  selected: !(settings?.selected ?? true),
                })
              }
              onToggleVisibility={() => togglePhaseVisibility(phase.key)}
            >
              <div className="grid gap-3 lg:grid-cols-[64px_minmax(200px,1fr)_110px_110px_150px_150px_110px_110px_110px_minmax(180px,1fr)] lg:items-end">
                <div className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                  <Switch
                    id={`needs-resp-${phase.key}`}
                    checked={showsResponsibleControls ? settings?.needsResponsible ?? true : false}
                    disabled={!showsResponsibleControls}
                    onCheckedChange={(checked) =>
                      updatePhaseSetting(phase.key, {
                        needsResponsible: Boolean(checked),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Responsable</Label>
                  {showsResponsibleControls && (settings?.needsResponsible ?? true) ? (
                    <Select
                      value={phaseResponsibles[phase.key]}
                      onValueChange={(value) =>
                        updatePhaseResponsible(phase.key, value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona un responsable..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">- Automatic -</SelectItem>
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
                <div>
                  <Label># Conductors</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form?.drivers ?? ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, {
                        drivers: Number.isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label># Treballadors</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form?.workers ?? ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, {
                        workers: Number.isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Data Inici</Label>
                  <Input
                    type="date"
                    value={form?.startDate || ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, { startDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Data Fi</Label>
                  <Input
                    type="date"
                    value={form?.endDate || ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, { endDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Hora Inici</Label>
                  <Input
                    type="time"
                    value={form?.startTime || ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, { startTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Hora Fi</Label>
                  <Input
                    type="time"
                    value={form?.endTime || ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, { endTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Hora d'arribada</Label>
                  <Input
                    type="time"
                    value={sharedArrivalTime}
                    onChange={(e) => {
                      assignments.forEach((_, idx) =>
                        updatePhaseVehicleAssignment(phase.key, idx, {
                          arrivalTime: e.target.value,
                        })
                      )
                    }}
                  />
                </div>
                <div>
                  <Label>Lloc de concentracio</Label>
                  <Input
                    type="text"
                    value={form?.meetingPoint || ""}
                    onChange={(e) =>
                      updatePhaseForm(phase.key, { meetingPoint: e.target.value })
                    }
                  />
                </div>
              </div>

              {assignments.length > 0 && (
                <div className="mt-2 space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-gray-500">
                    Vehicles disponibles (total): {availableVehicleCount} /{" "}
                    {availableVehicles.length}
                  </div>
                  {assignments.map((assign, idx) => {
                    const filtered = availableVehicles.filter((vehicle) => {
                      if (!vehicle.available) return false
                      if (
                        normalizeTransportType(vehicle.type) !==
                        normalizeTransportType(assign.vehicleType)
                      ) {
                        return false
                      }
                      if (assign.vehicleId && assign.vehicleId === vehicle.id) return true
                      return !assignedVehicleIds.has(vehicle.id)
                    })
                    const compatibleConductors = availableConductors.filter(
                      (conductor) =>
                        conductor.id === assign.conductorId ||
                        canDriverHandleVehicleType(conductor, assign.vehicleType)
                    )

                    return (
                      <div
                        key={idx}
                        className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <p className="text-sm font-semibold">Vehicle #{idx + 1}</p>
                        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(260px,1fr)] lg:items-end">
                          <div>
                            <Label>Tipus de vehicle</Label>
                            <Select
                              value={assign.vehicleType}
                              onValueChange={(value) =>
                                updatePhaseVehicleAssignment(phase.key, idx, {
                                  vehicleType: value,
                                  vehicleId: "",
                                  plate: "",
                                  conductorId: assign.conductorId || null,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Tipus de vehicle" />
                              </SelectTrigger>
                              <SelectContent>
                                {TRANSPORT_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Matricula vehicle</Label>
                            <Select
                              value={assign.vehicleId || "__any__"}
                              onValueChange={(value) => {
                                if (value === "__any__") {
                                  updatePhaseVehicleAssignment(phase.key, idx, {
                                    vehicleId: "",
                                    plate: "",
                                    conductorId: assign.conductorId || null,
                                  })
                                  return
                                }
                                const chosen = availableVehicles.find(
                                  (vehicle) => vehicle.id === value
                                )
                                updatePhaseVehicleAssignment(phase.key, idx, {
                                  vehicleId: value,
                                  plate: chosen?.plate || "",
                                  vehicleType: normalizeTransportType(chosen?.type),
                                  conductorId: assign.conductorId || chosen?.conductorId || null,
                                })
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Matricula vehicle" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__any__">
                                  (Nomes tipus, sense matricula)
                                </SelectItem>
                                {filtered.map((vehicle) => (
                                  <SelectItem key={vehicle.id} value={vehicle.id}>
                                    {vehicle.plate || "(sense matricula)"}
                                    {vehicle.type
                                      ? ` - ${
                                          TRANSPORT_TYPE_LABELS[
                                            normalizeTransportType(vehicle.type)
                                          ] || vehicle.type
                                        }`
                                      : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {assign.vehicleType && (
                              <div className="pt-1 text-xs text-gray-500">
                                Matricules disponibles: {filtered.length}
                              </div>
                            )}
                          </div>
                          <div>
                            <Label>Conductor</Label>
                            <Select
                              value={assign.conductorId || "__auto__"}
                              onValueChange={(value) =>
                                updatePhaseVehicleAssignment(phase.key, idx, {
                                  conductorId: value === "__auto__" ? null : value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona conductor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__auto__">- Automatic segons disponibilitat -</SelectItem>
                                {compatibleConductors.map((conductor) => (
                                  <SelectItem key={conductor.id} value={conductor.id}>
                                    {conductor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </PhaseCard>
          )
        })}
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="border-slate-200 bg-white text-slate-900 shadow-sm"
          onClick={toggleEtt}
        >
          {ettOpen ? "Amaga ETT" : "+ ETT"}
        </Button>
      </div>
      {ettOpen ? (
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
      ) : (
        <p className="text-xs text-slate-500">ETT · {ettData.workers || "0"} treballadors</p>
      )}
    </div>
  )
}
