import { normalizeTransportType } from '@/lib/transportTypes'

export type DriverCapability = {
  /** Conductor genèric (sense marcar camió petit/gran explícit al perfil). */
  isDriver?: boolean
  camioPetit?: boolean
  camioGran?: boolean
}

/** Només aquests tipus exigeixen la propietat `camioGran` al personal. */
const BIG_TRUCK_TYPES = new Set(['camioGran', 'camioGranFred'])

export const requiresBigTruckLicense = (vehicleType?: string) =>
  BIG_TRUCK_TYPES.has(normalizeTransportType(vehicleType))

/**
 * Regla de negoci (logística / personal):
 * - Amb `camioGran` es pot conduir qualsevol tipus.
 * - Amb només `camioPetit` es pot conduir tot excepte **Camió gran** i **Camió gran fred**
 *   (i la resta de tipus que no siguin `requiresBigTruckLicense`).
 * - Amb només `isDriver` (genèric) es tracta com a apte per a tot el que no sigui camió gran / gran fred.
 */
export const canDriverHandleVehicleType = (
  driver: DriverCapability | null | undefined,
  vehicleType?: string
) => {
  if (!driver) return false

  const hasBigTruck = driver.camioGran === true
  const hasSmallTruck = driver.camioPetit === true
  const hasGenericDriver = driver.isDriver === true

  if (!vehicleType) return hasBigTruck || hasSmallTruck || hasGenericDriver
  if (requiresBigTruckLicense(vehicleType)) return hasBigTruck

  return hasBigTruck || hasSmallTruck || hasGenericDriver
}
