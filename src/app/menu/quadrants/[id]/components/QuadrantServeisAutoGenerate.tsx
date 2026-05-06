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

import type { ServeiGroup } from "./autoGenerate/types"

type Totals = {
  workers: number
  drivers: number
  responsables: number
}

type Props = {
  groups: ServeiGroup[]
  totals: Totals
  addGroup: () => void
  removeGroup: (id: string) => void
  updateGroup: (id: string, patch: Partial<ServeiGroup>) => void
  eventStartDate: string
  meetingPoint: string
  availableConductors: Array<{ id: string; name: string }>
}

export default function QuadrantServeisAutoGenerate({
  groups,
  totals,
  addGroup,
  removeGroup,
  updateGroup,
  eventStartDate,
  meetingPoint: _meetingPoint,
  availableConductors,
}: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Grups Serveis</p>
          <p className="text-xs text-slate-500">
            Treballadors {totals.workers} · Conductors {totals.drivers} · Responsables
            {totals.responsables}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={addGroup}>
          + Grup
        </Button>
      </div>
      <div className="space-y-3">
        {groups.map((group, idx) => (
          <div key={group.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Grup {idx + 1}</span>
              {groups.length > 1 && (
                <button
                  type="button"
                  className="text-red-500 hover:underline"
                  onClick={() => removeGroup(group.id)}
                >
                  Elimina grup
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  placeholder="Montatge"
                  value={group.dateLabel}
                  onChange={(e) => updateGroup(group.id, { dateLabel: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label>Treballadors</Label>
                <Input
                  type="number"
                  min={0}
                  value={group.workers}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      workers: Number.isNaN(Number(e.target.value)) ? 0 : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`need-driver-${group.id}`}
                    checked={group.needsDriver}
                    onCheckedChange={(checked) =>
                      updateGroup(group.id, {
                        needsDriver: Boolean(checked),
                        driverId: checked ? group.driverId : '',
                      })
                    }
                  />
                  <Label htmlFor={`need-driver-${group.id}`} className="mb-0">
                    Necessita conductor?
                  </Label>
                </div>
                {group.needsDriver && (
                  <Select
                    value={group.driverId || '__none__'}
                    onValueChange={(value) =>
                      updateGroup(group.id, { driverId: value === '__none__' ? '' : value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un conductor…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sense assignar</SelectItem>
                      {availableConductors.map((conductor) => (
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
        ))}
      </div>
    </div>
  )
}
