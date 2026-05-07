"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ChevronDown, ChevronUp } from "lucide-react"
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
  mode?: 'auto' | 'semi' | 'manual'
  settings: Record<ServicePhaseKey, ServicePhaseSetting>
  visibility: Record<ServicePhaseKey, boolean>
  ettState: Record<ServicePhaseKey, ServicePhaseEtt>
  manualResponsibleId: string
  availableResponsables: Array<{ id: string; name: string }>
  availableConductors: Array<{ id: string; name: string }>
  availableJamoneros: Array<{ id: string; name: string }>
  availableTreballadors?: Array<{ id: string; name: string }>
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
  totals: _totals,
  meetingPoint,
  eventStartDate,
  mode = 'semi',
  settings,
  visibility,
  ettState,
  manualResponsibleId,
  availableResponsables,
  availableConductors,
  availableJamoneros,
  availableTreballadors = [],
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
}: Props) {
  const normalize = (value?: string) => String(value || "").trim().toLowerCase()
  const [openWorkers, setOpenWorkers] = useState<Record<string, boolean>>({})
  /** Per defecte el detall està desplegat; només es pliega quan l'estat és `false`. */
  const workerDetailExpanded = (groupId: string) => openWorkers[groupId] !== false
  void meetingPoint
  void setManualResponsible
  void updateSetting
  void _setJamoneroCount
  void availableJamoneros
  void jamoneroAssignments
  void updateJamoneroAssignment

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
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
                    const selectedWorkersElsewhere = new Set(
                      groups
                        .filter((candidate) => candidate.id !== group.id)
                        .flatMap((candidate) => (Array.isArray(candidate.workerIds) ? candidate.workerIds : []))
                        .map((id) => normalize(id))
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

                        <div className="grid gap-3 lg:grid-cols-[64px_minmax(220px,1fr)_64px_minmax(220px,1fr)_minmax(260px,1fr)_minmax(220px,1fr)_130px_130px_170px] lg:items-end">
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
                                value={
                                  mode === 'manual'
                                    ? group.responsibleId || "__manual_pick__"
                                    : group.responsibleId || "__auto__"
                                }
                                onValueChange={(value) =>
                                  updateGroup(group.id, {
                                    wantsResponsible: value !== "__none__",
                                    responsibleId:
                                      value === "__auto__" ||
                                      value === "__none__" ||
                                      value === "__manual_pick__"
                                        ? ""
                                        : value,
                                  })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue
                                    placeholder={mode === 'manual' ? 'Selecciona un responsable…' : 'Responsable de la fase...'}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {mode !== 'manual' ? (
                                    <SelectItem value="__auto__">Automàtic</SelectItem>
                                  ) : (
                                    <SelectItem value="__manual_pick__" disabled>
                                      Selecciona…
                                    </SelectItem>
                                  )}
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
                            {mode === 'manual' ? (
                              <div className="space-y-2">
                                <div className="grid gap-2 sm:grid-cols-[110px_auto] sm:items-end sm:justify-between">
                                  <div>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={30}
                                      className="h-10 w-[92px] tabular-nums"
                                      aria-label="Nombre de treballadors"
                                      value={group.workers}
                                      onChange={(e) => {
                                        const nextCount = Number.isNaN(Number(e.target.value))
                                          ? 0
                                          : Math.max(0, Math.min(30, Number(e.target.value)))
                                        const currentIds = Array.isArray(group.workerIds) ? [...group.workerIds] : []
                                        const currentDetails = { ...(group.workerDetails || {}) }

                                        if (nextCount < currentIds.length) {
                                          const removed = currentIds.slice(nextCount)
                                          removed.filter(Boolean).forEach((id) => {
                                            delete currentDetails[id]
                                          })
                                          updateGroup(group.id, {
                                            workers: nextCount,
                                            workerIds: currentIds.slice(0, nextCount),
                                            workerDetails: currentDetails,
                                          })
                                          return
                                        }

                                        if (nextCount > currentIds.length) {
                                          const toAdd = nextCount - currentIds.length
                                          updateGroup(group.id, {
                                            workers: nextCount,
                                            workerIds: [...currentIds, ...Array.from({ length: toAdd }, () => "")],
                                            workerDetails: currentDetails,
                                          })
                                          return
                                        }

                                        updateGroup(group.id, { workers: nextCount })
                                      }}
                                    />
                                  </div>
                                  <div className="flex items-end justify-start sm:justify-end">
                                    <button
                                      type="button"
                                      className="h-10 inline-flex items-center justify-start gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 whitespace-nowrap"
                                      onClick={() =>
                                        setOpenWorkers((prev) => ({ ...prev, [group.id]: !(prev[group.id] ?? true) }))
                                      }
                                    >
                                      {workerDetailExpanded(group.id) ? (
                                        <ChevronUp className="h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" />
                                      )}
                                      Detall{' '}
                                      <span className="text-slate-500">
                                        {Array.isArray(group.workerIds) ? group.workerIds.filter(Boolean).length : 0}/
                                        {group.workers}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
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
                            )}
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

                        {mode === 'manual' && workerDetailExpanded(group.id) ? (
                          <div className="mt-4 space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                            {(Array.isArray(group.workerIds) ? group.workerIds : []).map((workerId, slotIdx) => {
                              const safeId = String(workerId || "")
                              const resolved =
                                safeId && safeId !== "__none__"
                                  ? availableTreballadors.find((p) => p.id === safeId) || null
                                  : null
                              const details = safeId ? group.workerDetails?.[safeId] || { id: safeId } : { id: "" }
                              const reservedIds = new Set(
                                [manualResponsibleId, group.responsibleId, group.driverId]
                                  .map((x) => normalize(x))
                                  .filter(Boolean)
                              )
                              const usedInGroup = new Set(
                                (Array.isArray(group.workerIds) ? group.workerIds : [])
                                  .filter((id) => normalize(id) && normalize(id) !== normalize(safeId))
                                  .map((id) => normalize(id))
                              )
                              const workerOptions = availableTreballadors.filter((p) => {
                                const pid = normalize(p.id)
                                if (!pid) return false
                                if (pid === normalize(safeId)) return true
                                if (reservedIds.has(pid)) return false
                                if (usedInGroup.has(pid)) return false
                                if (selectedWorkersElsewhere.has(pid)) return false
                                return true
                              })

                              const setSlotWorker = (value: string) => {
                                const currentIds = Array.isArray(group.workerIds) ? [...group.workerIds] : []
                                const currentDetails = { ...(group.workerDetails || {}) }
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
                                    serviceDate: currentDetails[nextId]?.serviceDate || group.serviceDate,
                                    meetingPoint: currentDetails[nextId]?.meetingPoint || group.meetingPoint,
                                    startTime: currentDetails[nextId]?.startTime || group.startTime,
                                    endTime: currentDetails[nextId]?.endTime || group.endTime,
                                  }
                                }

                                updateGroup(group.id, {
                                  workerIds: currentIds,
                                  workerDetails: currentDetails,
                                })
                              }

                              const setDetail = (patch: Partial<NonNullable<typeof group.workerDetails>[string]>) => {
                                if (!safeId) return
                                updateGroup(group.id, {
                                  workerDetails: {
                                    ...(group.workerDetails || {}),
                                    [safeId]: {
                                      id: safeId,
                                      name: resolved?.name || group.workerDetails?.[safeId]?.name || safeId,
                                      ...(group.workerDetails?.[safeId] || {}),
                                      ...patch,
                                    },
                                  },
                                })
                              }

                              return (
                                <div
                                  key={`${slotIdx}-${safeId || "empty"}`}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                                >
                                  <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_160px_minmax(220px,1fr)_140px_140px] lg:items-end">
                                    <div>
                                      <Label>Treballador {slotIdx + 1}</Label>
                                      <Select value={safeId || "__none__"} onValueChange={setSlotWorker}>
                                        <SelectTrigger className="w-full bg-white">
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
                                    <div>
                                      <Label>Data</Label>
                                      <Input
                                        type="date"
                                        value={(safeId ? details.serviceDate : "") || group.serviceDate}
                                        disabled={!safeId}
                                        onChange={(e) => setDetail({ serviceDate: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label>Meeting</Label>
                                      <Input
                                        value={(safeId ? details.meetingPoint : "") || group.meetingPoint}
                                        disabled={!safeId}
                                        onChange={(e) => setDetail({ meetingPoint: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label>Inici</Label>
                                      <Input
                                        type="time"
                                        value={(safeId ? details.startTime : "") || group.startTime}
                                        disabled={!safeId}
                                        onChange={(e) => setDetail({ startTime: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label>Fi</Label>
                                      <Input
                                        type="time"
                                        value={(safeId ? details.endTime : "") || group.endTime}
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
