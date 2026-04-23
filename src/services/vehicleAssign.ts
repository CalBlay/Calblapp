// ✅ filename: src/services/vehicleAssign.ts
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { isEligibleByName, type BusyAssignment } from './eligibility'
import { normalizeVehicleType } from '@/utils/normalizeVehicleType'
import { canDriverHandleVehicleType } from '@/lib/driverCapabilities'

export type VehicleRequest = {
  vehicleType?: string
  plate?: string
  id?: string
  conductorId?: string | null
}

export type DriverPoolItem = {
  p: {
    id: string
    name: string
    department?: string
    maxHoursWeek?: number
    isDriver?: boolean
    camioPetit?: boolean
    camioGran?: boolean
  }
  weekAssigns: number
  weekHrs: number
  monthHrs: number
  lastAssignedAt: string | null
}

export type BaseCtx = {
  busyAssignments: BusyAssignment[]
  restHours: number
  allowMultipleEventsSameDay: boolean
}

export interface Transport {
  id: string
  plate?: string
  type?: string
  available?: boolean
  conductorId?: string | null
}

export interface DriverAssignment {
  name: string
  plate: string
  vehicleType: string
  meetingPoint: string
}

export type AssignDriverParams = {
  meetingPoint: string
  startISO: string
  endISO: string
  baseCtx: BaseCtx
  driverPool: DriverPoolItem[]
  vehiclesRequested: VehicleRequest[]
}

export async function assignVehiclesAndDrivers({
  meetingPoint,
  startISO,
  endISO,
  baseCtx,
  driverPool,
  vehiclesRequested,
}: AssignDriverParams): Promise<DriverAssignment[]> {
  const drivers: DriverAssignment[] = []
  const takeCompatibleDriver = (requestedVehicleType?: string) => {
    const idx = driverPool.findIndex((candidate) =>
      canDriverHandleVehicleType(candidate.p, requestedVehicleType)
    )
    if (idx < 0) return null
    const [picked] = driverPool.splice(idx, 1)
    return picked
  }

  // ✅ Consulta correcta dels transports a Firestore (admin)
  const transportsSnap = await db.collection('transports').get()
  const allTransports: Transport[] = transportsSnap.docs.map(d => {
    const data = d.data() as Partial<Transport>
    return {
      id: d.id,
      plate: data.plate,
      type: data.type,
      available: data.available,
      conductorId: data.conductorId,
    }
  })

  for (const requested of vehiclesRequested) {
    let chosenVehicle: Transport | null = null

    // --- Cas 3: vehicleId o matrícula explícita ---
    if (requested.id || requested.plate) {
      chosenVehicle =
        allTransports.find(
          v =>
            (requested.id && v.id === requested.id) ||
            (requested.plate && v.plate === requested.plate)
        ) || null
    }

    // --- Cas 2: només tipus ---
    if (!chosenVehicle && requested.vehicleType) {
      const pool = allTransports.filter(
        v =>
          normalizeVehicleType(v.type || '') ===
            normalizeVehicleType(requested.vehicleType || '') &&
          v.available !== false
      )
      chosenVehicle = pool.shift() || null
    }

    const requestedVehicleType = normalizeVehicleType(
      chosenVehicle?.type || requested.vehicleType || ''
    )

    // --- Cas 1: ni tipus ni matrícula ---
    if (!chosenVehicle && !requested.vehicleType && !requested.conductorId) {
      const pick = driverPool.shift()
      drivers.push({
        name: pick ? pick.p.name : 'Extra',
        meetingPoint,
        plate: '',
        vehicleType: '',
      })
      continue
    }

    // --- Assignació de conductor ---
    let assigned: string | null = null

    // conductorId explícit al quadrant (p. ex. responsable logística): respectar encara que
    // isEligibleByName falli per solapament amb un altre borrador (ja es mostra avís al quadrant).
    if (requested.conductorId) {
      const manualIdx = driverPool.findIndex((d) => d.p.id === requested.conductorId)
      const manual = manualIdx >= 0 ? driverPool[manualIdx] : null
      if (manual && canDriverHandleVehicleType(manual.p, requestedVehicleType)) {
        assigned = manual.p.name
        driverPool.splice(manualIdx, 1)
      }
    }

    if (!assigned && chosenVehicle?.conductorId) {
      const fixedIdx = driverPool.findIndex(d => d.p.id === chosenVehicle!.conductorId)
      const fixed = fixedIdx >= 0 ? driverPool[fixedIdx] : null
      if (fixed && canDriverHandleVehicleType(fixed.p, requestedVehicleType)) {
        const elig = isEligibleByName(fixed.p.name, startISO, endISO, baseCtx)
        if (elig.eligible) {
          assigned = fixed.p.name
          driverPool.splice(fixedIdx, 1)
        }
      }
    }

    if (!assigned) {
      const pick = takeCompatibleDriver(requestedVehicleType)
      assigned = pick ? pick.p.name : 'Extra'
    }

    drivers.push({
      name: assigned || 'Extra',
      meetingPoint,
      plate: chosenVehicle?.plate || '',
      vehicleType: requestedVehicleType,
    })
  }

  return drivers
}
