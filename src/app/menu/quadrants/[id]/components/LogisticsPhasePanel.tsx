"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
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
  /** Mode quadrant (manual: sense «automàtic» als desplegables principals + detall treballadors). */
  mode?: "auto" | "semi" | "manual"
  availableTreballadors?: Array<{ id: string; name: string }>
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
  mode = "semi",
  availableTreballadors = [],
}: Props) {
  const isManualMode = mode === "manual"
  const manualPickResponsible = "__manual_pick__"

  const [openWorkerSlots, setOpenWorkerSlots] = useState<
    Partial<Record<LogisticPhaseKey, boolean>>
  >({})
  /** Per defecte el detall està obert (`!== false`). */
  const workerSlotsExpanded = (key: LogisticPhaseKey) => openWorkerSlots[key] !== false

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
          const normalizePerson = (value?: string) =>
            String(value || "").trim().toLowerCase()

          const respStored = phaseResponsibles[phase.key] ?? ""
          const responsableSelectValue = isManualMode
            ? respStored &&
                respStored !== "__auto__" &&
                respStored !== manualPickResponsible &&
                respStored.trim()
              ? respStored
              : manualPickResponsible
            : respStored || "__auto__"

          const effectiveResponsibleId =
            showsResponsibleControls && (settings?.needsResponsible ?? true) && respStored &&
            respStored !== "__auto__" &&
            respStored !== manualPickResponsible
              ? respStored
              : ""

          const reservedForWorkers = new Set<string>()
          if (effectiveResponsibleId) reservedForWorkers.add(normalizePerson(effectiveResponsibleId))
          assignments.forEach((row) => {
            if (row.conductorId) reservedForWorkers.add(normalizePerson(row.conductorId))
          })
          const workersSelectedElsewhere = new Set(
            logisticPhaseOptions
              .filter((op) => op.key !== phase.key)
              .flatMap((op) => phaseForms[op.key]?.workerIds || [])
              .map((id) => normalizePerson(id))
              .filter(Boolean)
          )

          const rawWorkersNum = Number(form?.workers ?? 0)
          const workerSlotsCount =
            isManualMode && Number.isFinite(rawWorkersNum) && rawWorkersNum > 0
              ? Math.min(30, Math.max(0, Math.floor(rawWorkersNum)))
              : 0
          const workerSlotRows = Array.from(
            { length: workerSlotsCount },
            (_, i) => String(form?.workerIds?.[i] || "")
          )

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
              <div className="flex flex-col gap-2">
                {/* Una sola graella densa: controls + dates/horaris + lloc (2 files com a màxim en pantalles mitjanes). */}
                <div className="grid gap-x-2 gap-y-2 sm:grid-cols-2 lg:grid-cols-[2.75rem_minmax(0,1fr)_minmax(6rem,7rem)_minmax(110px,max-content)_minmax(0,10rem)_minmax(0,10rem)_minmax(7rem,9rem)_minmax(7rem,9rem)_minmax(6.5rem,8rem)_minmax(0,1.1fr)] lg:items-end">
                  <div className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 sm:col-span-2 lg:col-span-1 lg:h-9 lg:justify-center">
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
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs">Responsable</Label>
                    {showsResponsibleControls && (settings?.needsResponsible ?? true) ? (
                      <Select
                        value={responsableSelectValue}
                        onValueChange={(value) => {
                          if (isManualMode && value === manualPickResponsible) return
                          updatePhaseResponsible(phase.key, value)
                        }}
                      >
                        <SelectTrigger className="h-9 w-full max-w-full">
                          <SelectValue placeholder="Selecciona un responsable..." />
                        </SelectTrigger>
                        <SelectContent>
                          {!isManualMode ? (
                            <SelectItem value="__auto__">- Automatic -</SelectItem>
                          ) : (
                            <SelectItem value={manualPickResponsible} disabled>
                              Selecciona…
                            </SelectItem>
                          )}
                          {availableResponsables.map((resp) => (
                            <SelectItem key={resp.id} value={resp.id}>
                              {resp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex h-9 items-center rounded-md border border-slate-200 px-2 text-xs text-slate-400">
                        Sense responsable
                      </div>
                    )}
                  </div>
                  <div className="min-w-[6rem] overflow-visible lg:col-span-1">
                    <Label className="text-xs"># Conductors</Label>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-10 w-[92px] min-w-[6rem] tabular-nums"
                      value={form?.drivers ?? 0}
                      onChange={(e) => {
                        const raw = e.target.value
                        const rawNum = Number(raw)
                        updatePhaseForm(phase.key, {
                          drivers: raw === "" || Number.isNaN(rawNum) ? 0 : Math.max(0, rawNum),
                        })
                      }}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs">Treballadors</Label>
                    {isManualMode ? (
                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-[110px_auto] sm:items-end sm:justify-between">
                          <div className="min-w-0">
                            <Input
                              type="number"
                              min={0}
                              max={30}
                              className="h-10 w-[92px] tabular-nums"
                              aria-label="Nombre de treballadors"
                              value={form?.workers ?? 0}
                              onChange={(e) => {
                                const raw = e.target.value
                                const rawNum = Number(raw)
                                const nextCount =
                                  raw === "" || Number.isNaN(rawNum)
                                    ? 0
                                    : Math.max(0, Math.min(30, rawNum))
                                const currentIds = Array.isArray(form?.workerIds) ? [...form.workerIds] : []
                                const currentDetails = { ...(form?.workerDetails || {}) }
                                if (nextCount < currentIds.length) {
                                  const removed = currentIds.slice(nextCount)
                                  removed.filter(Boolean).forEach((id) => {
                                    delete currentDetails[id]
                                  })
                                  updatePhaseForm(phase.key, {
                                    workers: nextCount,
                                    workerIds: currentIds.slice(0, nextCount),
                                    workerDetails: currentDetails,
                                  })
                                  return
                                }
                                if (nextCount > currentIds.length) {
                                  const toAdd = nextCount - currentIds.length
                                  updatePhaseForm(phase.key, {
                                    workers: nextCount,
                                    workerIds: [
                                      ...currentIds,
                                      ...Array.from({ length: toAdd }, () => ""),
                                    ],
                                    workerDetails: currentDetails,
                                  })
                                  return
                                }
                                updatePhaseForm(phase.key, { workers: nextCount })
                              }}
                            />
                          </div>
                          <div className="flex items-end justify-start sm:justify-end">
                            <button
                              type="button"
                              className="h-10 inline-flex items-center justify-start gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 whitespace-nowrap"
                              onClick={() =>
                                setOpenWorkerSlots((prev) => ({
                                  ...prev,
                                  [phase.key]: !(prev[phase.key] ?? true),
                                }))
                              }
                            >
                              {workerSlotsExpanded(phase.key) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              Detall{" "}
                              <span className="text-slate-500">
                                {Array.isArray(form?.workerIds)
                                  ? form.workerIds.filter(Boolean).length
                                  : 0}
                                /{workerSlotsCount || Math.floor(Number(form?.workers) || 0)}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        className="h-10 tabular-nums"
                        value={form?.workers ?? 0}
                        onChange={(e) => {
                          const raw = e.target.value
                          const rawNum = Number(raw)
                          updatePhaseForm(phase.key, {
                            workers: raw === "" || Number.isNaN(rawNum) ? 0 : Math.max(0, rawNum),
                          })
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Data inici</Label>
                    <Input
                      type="date"
                      className="h-8 max-w-[9.75rem] text-sm px-2"
                      value={form?.startDate || ""}
                      onChange={(e) =>
                        updatePhaseForm(phase.key, { startDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Data fi</Label>
                    <Input
                      type="date"
                      className="h-8 max-w-[9.75rem] text-sm px-2"
                      value={form?.endDate || ""}
                      onChange={(e) =>
                        updatePhaseForm(phase.key, { endDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Hora ini.</Label>
                    <Input
                      type="time"
                      className="h-8 max-w-[6.85rem] text-sm px-2 tabular-nums"
                      value={form?.startTime || ""}
                      onChange={(e) =>
                        updatePhaseForm(phase.key, { startTime: e.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Hora fi</Label>
                    <Input
                      type="time"
                      className="h-8 max-w-[6.85rem] text-sm px-2 tabular-nums"
                      value={form?.endTime || ""}
                      onChange={(e) =>
                        updatePhaseForm(phase.key, { endTime: e.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Arribada</Label>
                    <Input
                      type="time"
                      className="h-8 max-w-[6.85rem] text-sm px-2 tabular-nums"
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
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs">Lloc concentració</Label>
                    <Input
                      type="text"
                      className="h-8 text-sm px-2"
                      value={form?.meetingPoint || ""}
                      onChange={(e) =>
                        updatePhaseForm(phase.key, { meetingPoint: e.target.value })
                      }
                    />
                  </div>
                </div>

                {isManualMode && workerSlotsCount > 0 && workerSlotsExpanded(phase.key) ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 sm:p-3">
                    {workerSlotRows.map((workerId, slotIdx) => {
                      const safeId = String(workerId || "")
                      const resolved =
                        safeId && safeId !== "__none__"
                          ? availableTreballadors.find((p) => p.id === safeId) || null
                          : null
                      const details = safeId
                        ? form?.workerDetails?.[safeId] || { id: safeId }
                        : { id: "" }
                      const usedInPhase = new Set(
                        (Array.isArray(form?.workerIds) ? form.workerIds : [])
                          .filter((id) => normalizePerson(id) && normalizePerson(id) !== normalizePerson(safeId))
                          .map((id) => normalizePerson(id))
                      )
                      const workerOptions = availableTreballadors.filter((p) => {
                        const pid = normalizePerson(p.id)
                        if (!pid) return false
                        if (pid === normalizePerson(safeId)) return true
                        if (reservedForWorkers.has(pid)) return false
                        if (usedInPhase.has(pid)) return false
                        if (workersSelectedElsewhere.has(pid)) return false
                        return true
                      })

                      const setSlotWorker = (value: string) => {
                        const currentIds = Array.isArray(form?.workerIds) ? [...form.workerIds] : []
                        const currentDetails = { ...(form?.workerDetails || {}) }
                        const prevId = String(currentIds[slotIdx] || "")
                        const nextId = value === "__none__" ? "" : value
                        currentIds[slotIdx] = nextId
                        if (prevId && prevId !== nextId) {
                          delete currentDetails[prevId]
                        }
                        if (nextId) {
                          const personName =
                            availableTreballadors.find((p) => p.id === nextId)?.name || nextId
                          currentDetails[nextId] = {
                            id: nextId,
                            name: currentDetails[nextId]?.name || personName,
                            serviceDate:
                              currentDetails[nextId]?.serviceDate || form?.startDate || "",
                            meetingPoint:
                              currentDetails[nextId]?.meetingPoint || form?.meetingPoint || "",
                            startTime: currentDetails[nextId]?.startTime || form?.startTime || "",
                            endTime: currentDetails[nextId]?.endTime || form?.endTime || "",
                          }
                        }
                        updatePhaseForm(phase.key, {
                          workerIds: currentIds,
                          workerDetails: currentDetails,
                        })
                      }

                      const setDetail = (
                        patch: Partial<NonNullable<LogisticPhaseForm["workerDetails"]>[string]>
                      ) => {
                        if (!safeId) return
                        updatePhaseForm(phase.key, {
                          workerDetails: {
                            ...(form?.workerDetails || {}),
                            [safeId]: {
                              id: safeId,
                              name:
                                resolved?.name ||
                                form?.workerDetails?.[safeId]?.name ||
                                safeId,
                              ...(form?.workerDetails?.[safeId] || {}),
                              ...patch,
                            },
                          },
                        })
                      }

                      return (
                        <div
                          key={`${phase.key}-${slotIdx}-${safeId || "empty"}`}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm sm:px-3"
                        >
                          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,0.9fr)_5.25rem_5.25rem] lg:items-end">
                            <div className="min-w-0">
                              <Label className="text-xs">Treballador {slotIdx + 1}</Label>
                              <Select value={safeId || "__none__"} onValueChange={setSlotWorker}>
                                <SelectTrigger className="h-9 w-full bg-white text-sm">
                                  <SelectValue placeholder="Selecciona…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {workerOptions.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="min-w-0">
                              <Label className="text-xs">Data</Label>
                              <Input
                                type="date"
                                className="h-8 max-w-[9rem] px-2 text-sm"
                                value={(safeId ? details.serviceDate : "") || form?.startDate || ""}
                                disabled={!safeId}
                                onChange={(e) => setDetail({ serviceDate: e.target.value })}
                              />
                            </div>
                            <div className="min-w-0">
                              <Label className="text-xs">Meeting</Label>
                              <Input
                                className="h-8 px-2 text-sm"
                                value={(safeId ? details.meetingPoint : "") || form?.meetingPoint || ""}
                                disabled={!safeId}
                                onChange={(e) => setDetail({ meetingPoint: e.target.value })}
                              />
                            </div>
                            <div className="min-w-0">
                              <Label className="text-xs">Inici</Label>
                              <Input
                                type="time"
                                className="h-8 max-w-[5.75rem] px-2 text-sm tabular-nums"
                                value={(safeId ? details.startTime : "") || form?.startTime || ""}
                                disabled={!safeId}
                                onChange={(e) => setDetail({ startTime: e.target.value })}
                              />
                            </div>
                            <div className="min-w-0">
                              <Label className="text-xs">Fi</Label>
                              <Input
                                type="time"
                                className="h-8 max-w-[5.75rem] px-2 text-sm tabular-nums"
                                value={(safeId ? details.endTime : "") || form?.endTime || ""}
                                disabled={!safeId}
                                onChange={(e) => setDetail({ endTime: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
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
                          </div>
                          <div>
                            <Label>Conductor</Label>
                            <Select
                              value={
                                isManualMode
                                  ? assign.conductorId || "__none__"
                                  : assign.conductorId || "__auto__"
                              }
                              onValueChange={(value) =>
                                updatePhaseVehicleAssignment(phase.key, idx, {
                                  conductorId:
                                    value === "__auto__" || value === "__none__" ? null : value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona conductor" />
                              </SelectTrigger>
                              <SelectContent>
                                {isManualMode ? (
                                  <SelectItem value="__none__">Sense assignar</SelectItem>
                                ) : (
                                  <SelectItem value="__auto__">
                                    - Automatic segons disponibilitat -
                                  </SelectItem>
                                )}
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
