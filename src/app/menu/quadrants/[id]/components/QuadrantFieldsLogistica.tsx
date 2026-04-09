'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportType,
} from '@/lib/transportTypes'

type VehicleAssignment = {
  vehicleType: string
  vehicleId: string
  plate: string
  arrivalTime?: string
}

type AvailableVehicle = {
  id: string
  plate?: string
  type?: string
  available: boolean
}

type Props = {
  totalWorkers: string
  numDrivers: string
  setTotalWorkers: (v: string) => void
  setNumDrivers: (v: string) => void
  vehicleAssignments: VehicleAssignment[]
  setVehicleAssignments: (v: VehicleAssignment[]) => void
  available: { vehicles: AvailableVehicle[] }
  hideCounts?: boolean
}

export default function QuadrantFieldsLogistica({
  totalWorkers,
  numDrivers,
  setTotalWorkers,
  setNumDrivers,
  vehicleAssignments,
  setVehicleAssignments,
  available,
  hideCounts = false,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {!hideCounts && (
        <>
          <div>
            <Label># Treballadors</Label>
            <Input
              type="number"
              min={0}
              value={totalWorkers}
              onChange={(e) => setTotalWorkers(e.target.value)}
            />
          </div>

          <div>
            <Label># Conductors</Label>
            <Input
              type="number"
              min={0}
              value={numDrivers}
              onChange={(e) => setNumDrivers(e.target.value)}
            />
          </div>
        </>
      )}

      <div className={hideCounts ? 'col-span-2' : ''}>
        <div className="mt-2 text-sm text-gray-700">
          Vehicles disponibles (total): {available.vehicles.filter((v) => v.available).length} /{' '}
          {available.vehicles.length}
        </div>

        {vehicleAssignments.map((assign, idx) => {
          const filtered = (available.vehicles || []).filter(
            (v) =>
              v.available &&
              normalizeTransportType(v.type || '') ===
                normalizeTransportType(assign.vehicleType) &&
              !vehicleAssignments.some((a, i) => i !== idx && a.vehicleId === v.id)
          )

          return (
            <div key={idx} className="mt-3 space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Vehicle #{idx + 1}</p>

              <Select
                value={assign.vehicleType}
                onValueChange={(val) => {
                  const upd = [...vehicleAssignments]
                  upd[idx].vehicleType = val
                  upd[idx].vehicleId = ''
                  upd[idx].plate = ''
                  setVehicleAssignments(upd)
                }}
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

              {assign.vehicleType && (
                <>
                  <Select
                    value={assign.vehicleId}
                    onValueChange={(val) => {
                      if (val === '__any__') {
                        const upd = [...vehicleAssignments]
                        upd[idx].vehicleId = ''
                        upd[idx].plate = ''
                        setVehicleAssignments(upd)
                        return
                      }

                      const chosen = available.vehicles.find((v) => v.id === val)
                      const upd = [...vehicleAssignments]
                      upd[idx].vehicleId = val
                      upd[idx].plate = chosen?.plate || ''
                      upd[idx].vehicleType = normalizeTransportType(
                        chosen?.type || upd[idx].vehicleType
                      )
                      setVehicleAssignments(upd)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipus nomes o matricula" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">(Nomes tipus, sense matricula)</SelectItem>

                      {filtered.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plate || '(sense matricula)'}
                          {v.type
                            ? ` - ${TRANSPORT_TYPE_LABELS[normalizeTransportType(v.type)] || v.type}`
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="space-y-1 pt-2">
                    <Label>Hora d'arribada</Label>
                    <Input
                      type="time"
                      value={assign.arrivalTime || ''}
                      onChange={(e) => {
                        const upd = [...vehicleAssignments]
                        upd[idx].arrivalTime = e.target.value
                        setVehicleAssignments(upd)
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
