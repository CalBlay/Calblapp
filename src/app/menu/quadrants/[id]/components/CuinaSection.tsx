'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'
import { canDriverHandleVehicleType, type DriverCapability } from '@/lib/driverCapabilities'
import type { CuinaDriverAssignment } from './quadrantModalTypes'

type PersonnelOption = {
  id: string
  name: string
}

type ConductorOption = PersonnelOption & {
  [key: string]: unknown
}

type CuinaGroup = {
  id: string
  meetingPoint: string
  startTime: string
  arrivalTime: string
  endTime: string
  workers: number
  drivers: number
  needsDriver: boolean
  wantsResponsible: boolean
  responsibleId: string
  driverMode: string
  vehicleType: string
  driverAssignments?: CuinaDriverAssignment[]
  workerIds?: string[]
  workerDetails?: Record<
    string,
    {
      id: string
      name?: string
      serviceDate?: string
      meetingPoint?: string
      startTime?: string
      endTime?: string
    }
  >
}

type CuinaEttState = {
  open: boolean
  data: {
    serviceDate: string
    meetingPoint: string
    startTime: string
    endTime: string
    workers: string
  }
}

const CUINA_VEHICLE_TYPE_OPTIONS = [
  'camioPPlataforma',
  'furgonetaPetita',
  'furgonetaMitjana',
  'furgonetaGran',
  'camioPPlataformaFred',
] as const

type Props = {
  mode: 'auto' | 'semi' | 'manual'
  cuinaGroups: CuinaGroup[]
  removeCuinaGroup: (id: string) => void
  updateCuinaGroup: (id: string, patch: Partial<CuinaGroup>) => void
  manualResp: string
  /** Data yyyy-MM-dd per treballadors manual (equivalent «data servei» de Serveis) */
  serviceDate: string
  availableTreballadors: PersonnelOption[]
  availableResponsables: PersonnelOption[]
  availableConductors: ConductorOption[]
  addCuinaGroup: () => void
  cuinaEtt: CuinaEttState
  setCuinaEtt: React.Dispatch<React.SetStateAction<CuinaEttState>>
}

export default function CuinaSection({
  mode,
  cuinaGroups,
  removeCuinaGroup,
  updateCuinaGroup,
  manualResp,
  serviceDate,
  availableTreballadors,
  availableResponsables,
  availableConductors,
  addCuinaGroup,
  cuinaEtt,
  setCuinaEtt,
}: Props) {
  const [openWorkers, setOpenWorkers] = useState<Record<string, boolean>>({})
  const normalize = (value?: string) => String(value || '').trim().toLowerCase()
  /** Per defecte el detall està desplegat; només es pliega quan l'estat és `false`. */
  const workerDetailExpanded = (groupId: string) => openWorkers[groupId] !== false

  const isManualMode = mode === 'manual'
  /** En manual mai oferim assignació automàtica als desplegables de grup */
  const manualPickResponsible = '__manual_pick_responsible__'
  const manualPickConductor = '__manual_pick_conductor__'
  /** Manual: «sense responsable» només al desplegable (sense interruptor que confongui amb auto). */
  const cuinaNoResponsible = '__cuina_no_responsible__'

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <div className="space-y-3">
        {cuinaGroups.map((group, idx) => {
          const driverAssignments = Array.isArray(group.driverAssignments)
            ? group.driverAssignments
            : []
          const selectedRespForReserve =
            group.wantsResponsible
              ? group.responsibleId || (manualResp && manualResp !== '__auto__' ? manualResp : '')
              : ''
          const selectedDriverForReserve = driverAssignments
            .map((assignment) =>
              assignment.driverMode === '__responsable__'
                ? selectedRespForReserve
                : assignment.driverMode &&
                    assignment.driverMode !== '__auto__' &&
                    assignment.driverMode !== manualPickConductor
                  ? assignment.driverMode
                  : ''
            )
            .find(Boolean) || ''
          const selectedWorkersElsewhere = new Set(
            cuinaGroups
              .filter((c) => c.id !== group.id)
              .flatMap((c) => (Array.isArray(c.workerIds) ? c.workerIds : []))
              .map((id) => normalize(id))
              .filter(Boolean)
          )
          const reservedIds = new Set(
            [
              manualResp && manualResp !== '__auto__' ? manualResp : '',
              selectedRespForReserve,
              selectedDriverForReserve,
            ]
              .map((x) => normalize(x))
              .filter(Boolean)
          )

          return (
          <div key={group.id} className="border border-slate-200 rounded-xl bg-white p-3 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Grup {idx + 1}</span>
              {cuinaGroups.length > 1 && (
                <button type="button" className="text-red-500 hover:underline" onClick={() => removeCuinaGroup(group.id)}>
                  Elimina grup
                </button>
              )}
            </div>
            <div
              className={
                isManualMode
                  ? 'grid gap-3 lg:grid-cols-[minmax(160px,220px)_minmax(72px,96px)_minmax(220px,280px)_minmax(140px,1fr)_minmax(0,130px)_minmax(0,130px)_minmax(0,130px)] lg:items-end'
                  : 'grid gap-3 lg:grid-cols-[64px_minmax(160px,220px)_minmax(72px,96px)_minmax(88px,110px)_minmax(140px,1fr)_minmax(0,130px)_minmax(0,130px)_minmax(0,130px)] lg:items-end'
              }
            >
              {!isManualMode && (
              <div className="flex h-10 min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <Switch
                  id={`cuina-needs-responsible-${group.id}`}
                  checked={group.wantsResponsible}
                  onCheckedChange={(checked) =>
                    updateCuinaGroup(group.id, {
                      wantsResponsible: Boolean(checked),
                      responsibleId:
                        checked && !group.responsibleId && manualResp && manualResp !== '__auto__'
                          ? manualResp
                          : checked
                          ? group.responsibleId
                          : '',
                    })
                  }
                />
              </div>
              )}
              <div className="min-w-0">
                <Label>Responsable</Label>
                {isManualMode ? (
                  <Select
                    value={
                      !group.wantsResponsible
                        ? cuinaNoResponsible
                        : group.responsibleId || manualPickResponsible
                    }
                    onValueChange={(value) => {
                      if (value === cuinaNoResponsible) {
                        updateCuinaGroup(group.id, {
                          wantsResponsible: false,
                          responsibleId: '',
                        })
                        return
                      }
                      updateCuinaGroup(group.id, {
                        wantsResponsible: true,
                        responsibleId: value === manualPickResponsible ? '' : value,
                      })
                    }}
                  >
                    <SelectTrigger className="h-10 w-full max-w-full">
                      <SelectValue placeholder="Responsable del grup…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={cuinaNoResponsible}>Sense responsable</SelectItem>
                      <SelectItem value={manualPickResponsible}>Selecciona un responsable…</SelectItem>
                      {availableResponsables.map((resp) => (
                        <SelectItem key={resp.id} value={resp.id}>
                          {resp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : group.wantsResponsible ? (
                  <Select
                    value={group.responsibleId || '__auto__'}
                    onValueChange={(value) =>
                      updateCuinaGroup(group.id, {
                        responsibleId: value === '__auto__' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full max-w-full">
                      <SelectValue placeholder="Responsable del grup…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Automàtic</SelectItem>
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
              <div className="min-w-0">
                <Label>Conductors</Label>
                <Input
                  type="number"
                  min={0}
                  value={group.drivers}
                  onChange={(e) =>
                    updateCuinaGroup(group.id, {
                      drivers: Number.isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value)),
                      needsDriver: Number(e.target.value) > 0,
                      ...(Number(e.target.value) > 0 ? {} : { driverMode: '__auto__', vehicleType: '', driverAssignments: [] }),
                    })
                  }
                />
              </div>
              <div className="min-w-0">
                <Label>Treballadors</Label>
                {isManualMode ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="shrink-0">
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
                              updateCuinaGroup(group.id, {
                                workers: nextCount,
                                workerIds: currentIds.slice(0, nextCount),
                                workerDetails: currentDetails,
                              })
                              return
                            }

                            if (nextCount > currentIds.length) {
                              const toAdd = nextCount - currentIds.length
                              updateCuinaGroup(group.id, {
                                workers: nextCount,
                                workerIds: [...currentIds, ...Array.from({ length: toAdd }, () => '')],
                                workerDetails: currentDetails,
                              })
                              return
                            }

                            updateCuinaGroup(group.id, { workers: nextCount })
                          }}
                        />
                      </div>
                      <div className="min-w-0 shrink-0">
                        <button
                          type="button"
                          className="h-10 inline-flex max-w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 whitespace-nowrap"
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
                    value={group.workers}
                    onChange={(e) =>
                      updateCuinaGroup(group.id, {
                        workers: Number.isNaN(Number(e.target.value)) ? 0 : Number(e.target.value),
                      })
                    }
                  />
                )}
              </div>
              <div className="min-w-0">
                <Label>Meeting point</Label>
                <Input
                  className="min-w-0"
                  value={group.meetingPoint}
                  onChange={(e) => updateCuinaGroup(group.id, { meetingPoint: e.target.value })}
                />
              </div>
              <div className="min-w-0">
                <Label>Hora Inici</Label>
                <Input type="time" value={group.startTime} onChange={(e) => updateCuinaGroup(group.id, { startTime: e.target.value })} />
              </div>
              <div className="min-w-0">
                <Label>Hora Fi</Label>
                <Input type="time" value={group.endTime} onChange={(e) => updateCuinaGroup(group.id, { endTime: e.target.value })} />
              </div>
              <div className="min-w-0">
                <Label>Hora arribada</Label>
                <Input type="time" value={group.arrivalTime} onChange={(e) => updateCuinaGroup(group.id, { arrivalTime: e.target.value })} />
              </div>
            </div>

            {isManualMode && workerDetailExpanded(group.id) ? (
              <div className="mt-1 space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                {(Array.isArray(group.workerIds) ? group.workerIds : []).map((workerId, slotIdx) => {
                  const safeId = String(workerId || '')
                  const resolved =
                    safeId && safeId !== '__none__'
                      ? availableTreballadors.find((p) => p.id === safeId) || null
                      : null
                  const details = safeId ? group.workerDetails?.[safeId] || { id: safeId } : { id: '' }
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
                    const prevId = String(currentIds[slotIdx] || '')
                    const nextId = value === '__none__' ? '' : value

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
                        serviceDate: currentDetails[nextId]?.serviceDate || serviceDate,
                        meetingPoint: currentDetails[nextId]?.meetingPoint || group.meetingPoint,
                        startTime: currentDetails[nextId]?.startTime || group.startTime,
                        endTime: currentDetails[nextId]?.endTime || group.endTime,
                      }
                    }

                    updateCuinaGroup(group.id, {
                      workerIds: currentIds,
                      workerDetails: currentDetails,
                    })
                  }

                  const setDetail = (
                    patch: Partial<NonNullable<typeof group.workerDetails>[string]>
                  ) => {
                    if (!safeId) return
                    updateCuinaGroup(group.id, {
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
                      key={`${slotIdx}-${safeId || 'empty'}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_160px_minmax(220px,1fr)_140px_140px] lg:items-end">
                        <div>
                          <Label>Treballador {slotIdx + 1}</Label>
                          <Select value={safeId || '__none__'} onValueChange={setSlotWorker}>
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
                            value={(safeId ? details.serviceDate : '') || serviceDate}
                            disabled={!safeId}
                            onChange={(e) => setDetail({ serviceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Meeting</Label>
                          <Input
                            value={(safeId ? details.meetingPoint : '') || group.meetingPoint}
                            disabled={!safeId}
                            onChange={(e) => setDetail({ meetingPoint: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Inici</Label>
                          <Input
                            type="time"
                            value={(safeId ? details.startTime : '') || group.startTime}
                            disabled={!safeId}
                            onChange={(e) => setDetail({ startTime: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Fi</Label>
                          <Input
                            type="time"
                            value={(safeId ? details.endTime : '') || group.endTime}
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
            {Number(group.drivers || 0) > 0 && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                {driverAssignments.map((assignment, driverIdx) => (
                <div key={`${group.id}-driver-${driverIdx}`} className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,1fr)] lg:items-end">
                  <div>
                    <Label>{driverAssignments.length > 1 ? `Tipus de vehicle ${driverIdx + 1}` : 'Tipus de vehicle'}</Label>
                    <Select
                      value={assignment.vehicleType || '__none__'}
                      onValueChange={(value) =>
                        updateCuinaGroup(group.id, {
                          driverAssignments: driverAssignments.map((item, idx2) =>
                            idx2 === driverIdx
                              ? { ...item, vehicleType: value === '__none__' ? '' : value }
                              : item
                          ),
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona tipus de vehicle…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sense tipus concret —</SelectItem>
                        {CUINA_VEHICLE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {TRANSPORT_TYPE_LABELS[option] || option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{driverAssignments.length > 1 ? `Conductor ${driverIdx + 1}` : 'Conductor'}</Label>
                    <Select
                      value={
                        isManualMode &&
                        Number(group.drivers || 0) > 0 &&
                        (!assignment.driverMode || assignment.driverMode === '__auto__')
                          ? manualPickConductor
                          : assignment.driverMode || '__auto__'
                      }
                      onValueChange={(value) =>
                        updateCuinaGroup(group.id, {
                          driverAssignments: driverAssignments.map((item, idx2) =>
                            idx2 === driverIdx
                              ? {
                                  ...item,
                                  driverMode:
                                    value === manualPickConductor
                                      ? ''
                                      : value === '__auto__'
                                      ? '__auto__'
                                      : value,
                                }
                              : item
                          ),
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona conductor…" />
                      </SelectTrigger>
                      <SelectContent>
                        {isManualMode && Number(group.drivers || 0) > 0 ? (
                          <SelectItem value={manualPickConductor}>Selecciona un conductor…</SelectItem>
                        ) : (
                          <SelectItem value="__auto__">— Automatic segons disponibilitat —</SelectItem>
                        )}
                        {group.wantsResponsible &&
                          (group.responsibleId || (manualResp && manualResp !== '__auto__')) &&
                          availableConductors.some((conductor) => {
                            const responsibleId = group.responsibleId || (manualResp !== '__auto__' ? manualResp : '')
                            return (
                              conductor.id === responsibleId &&
                              canDriverHandleVehicleType(conductor as DriverCapability, assignment.vehicleType || '')
                            )
                          }) && <SelectItem value="__responsable__">Responsable</SelectItem>}
                        {availableConductors
                          .filter(
                            (conductor) =>
                              conductor.id === assignment.driverMode ||
                              canDriverHandleVehicleType(conductor as DriverCapability, assignment.vehicleType || '')
                          )
                          .map((conductor) => (
                            <SelectItem key={conductor.id} value={conductor.id}>
                              {conductor.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                ))}
              </div>
            )}
          </div>
          )
        })}
        <div className="flex justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-slate-900 border-slate-200 bg-white shadow-sm"
              onClick={() => setCuinaEtt((prev) => ({ ...prev, open: !prev.open }))}
            >
              {cuinaEtt.open ? 'Amaga ETT' : '+ ETT'}
            </Button>
            <Button variant="outline" size="sm" onClick={addCuinaGroup}>
              + Grup
            </Button>
          </div>
        </div>
        {cuinaEtt.open ? (
          <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 lg:grid-cols-[160px_170px_170px_130px_130px_minmax(260px,1fr)] lg:items-end">
              <div>
                <Label>Treballadors ETT</Label>
                <Input
                  type="number"
                  min={0}
                  value={cuinaEtt.data.workers}
                  onChange={(e) =>
                    setCuinaEtt((prev) => ({
                      ...prev,
                      data: { ...prev.data, workers: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Data inici</Label>
                <Input
                  type="date"
                  value={cuinaEtt.data.serviceDate}
                  onChange={(e) =>
                    setCuinaEtt((prev) => ({
                      ...prev,
                      data: { ...prev.data, serviceDate: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Data fi</Label>
                <Input
                  type="date"
                  value={cuinaEtt.data.serviceDate}
                  onChange={(e) =>
                    setCuinaEtt((prev) => ({
                      ...prev,
                      data: { ...prev.data, serviceDate: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Hora inici</Label>
                <Input
                  type="time"
                  value={cuinaEtt.data.startTime}
                  onChange={(e) =>
                    setCuinaEtt((prev) => ({
                      ...prev,
                      data: { ...prev.data, startTime: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Hora fi</Label>
                <Input
                  type="time"
                  value={cuinaEtt.data.endTime}
                  onChange={(e) =>
                    setCuinaEtt((prev) => ({
                      ...prev,
                      data: { ...prev.data, endTime: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Lloc</Label>
                <Input
                  value={cuinaEtt.data.meetingPoint}
                  onChange={(e) =>
                    setCuinaEtt((prev) => ({
                      ...prev,
                      data: { ...prev.data, meetingPoint: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">ETT · {cuinaEtt.data.workers || '0'} treballadors</p>
        )}
      </div>
    </div>
  )
}
