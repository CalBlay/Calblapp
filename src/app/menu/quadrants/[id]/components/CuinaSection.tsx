'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'
import { canDriverHandleVehicleType } from '@/lib/driverCapabilities'

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
  cuinaTotals: { workers: number; drivers: number; responsables: number }
  cuinaGroups: CuinaGroup[]
  removeCuinaGroup: (id: string) => void
  updateCuinaGroup: (id: string, patch: Partial<CuinaGroup>) => void
  manualResp: string
  availableResponsables: PersonnelOption[]
  availableConductors: ConductorOption[]
  addCuinaGroup: () => void
  cuinaEtt: CuinaEttState
  setCuinaEtt: React.Dispatch<React.SetStateAction<CuinaEttState>>
}

export default function CuinaSection({
  cuinaTotals,
  cuinaGroups,
  removeCuinaGroup,
  updateCuinaGroup,
  manualResp,
  availableResponsables,
  availableConductors,
  addCuinaGroup,
  cuinaEtt,
  setCuinaEtt,
}: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Fase cuina</p>
          <p className="text-xs text-slate-500">
            Treballadors {cuinaTotals.workers} · Conductors {cuinaTotals.drivers} · Grups {cuinaTotals.responsables}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {cuinaGroups.map((group, idx) => (
          <div key={group.id} className="border border-slate-200 rounded-xl bg-white p-3 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Grup {idx + 1}</span>
              {cuinaGroups.length > 1 && (
                <button type="button" className="text-red-500 hover:underline" onClick={() => removeCuinaGroup(group.id)}>
                  Elimina grup
                </button>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-[64px_minmax(220px,1fr)_110px_110px_minmax(220px,1fr)_130px_130px_130px] lg:items-end">
              <div className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
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
              <div>
                <Label>Responsable</Label>
                {group.wantsResponsible ? (
                  <Select
                    value={group.responsibleId || '__auto__'}
                    onValueChange={(value) =>
                      updateCuinaGroup(group.id, { responsibleId: value === '__auto__' ? '' : value })
                    }
                  >
                    <SelectTrigger className="w-full">
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
              <div>
                <Label>Conductors</Label>
                <Input
                  type="number"
                  min={0}
                  value={group.drivers}
                  onChange={(e) =>
                    updateCuinaGroup(group.id, {
                      drivers: Number.isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value)),
                      needsDriver: Number(e.target.value) > 0,
                      ...(Number(e.target.value) > 0 ? {} : { driverMode: '__auto__', vehicleType: '' }),
                    })
                  }
                />
              </div>
              <div>
                <Label>Treballadors</Label>
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
              </div>
              <div>
                <Label>Meeting point</Label>
                <Input value={group.meetingPoint} onChange={(e) => updateCuinaGroup(group.id, { meetingPoint: e.target.value })} />
              </div>
              <div>
                <Label>Hora Inici</Label>
                <Input type="time" value={group.startTime} onChange={(e) => updateCuinaGroup(group.id, { startTime: e.target.value })} />
              </div>
              <div>
                <Label>Hora Fi</Label>
                <Input type="time" value={group.endTime} onChange={(e) => updateCuinaGroup(group.id, { endTime: e.target.value })} />
              </div>
              <div>
                <Label>Hora arribada</Label>
                <Input type="time" value={group.arrivalTime} onChange={(e) => updateCuinaGroup(group.id, { arrivalTime: e.target.value })} />
              </div>
            </div>
            {Number(group.drivers || 0) > 0 && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,1fr)] lg:items-end">
                  <div>
                    <Label>Tipus de vehicle</Label>
                    <Select
                      value={group.vehicleType || '__none__'}
                      onValueChange={(value) =>
                        updateCuinaGroup(group.id, {
                          vehicleType: value === '__none__' ? '' : value,
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
                    <Label>Conductor</Label>
                    <Select
                      value={group.driverMode || '__auto__'}
                      onValueChange={(value) => updateCuinaGroup(group.id, { driverMode: value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona conductor…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">— Automatic segons disponibilitat —</SelectItem>
                        {group.wantsResponsible &&
                          (group.responsibleId || (manualResp && manualResp !== '__auto__')) &&
                          availableConductors.some((conductor) => {
                            const responsibleId = group.responsibleId || (manualResp !== '__auto__' ? manualResp : '')
                            return conductor.id === responsibleId && canDriverHandleVehicleType(conductor, group.vehicleType || '')
                          }) && <SelectItem value="__responsable__">Responsable</SelectItem>}
                        {availableConductors
                          .filter(
                            (conductor) =>
                              conductor.id === group.driverMode ||
                              canDriverHandleVehicleType(conductor, group.vehicleType || '')
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
              </div>
            )}
          </div>
        ))}
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
