import { normalizeTransportType } from '@/lib/transportTypes'

export type DriverCapability = {
  isDriver?: boolean
  camioPetit?: boolean
  camioGran?: boolean
}

const BIG_TRUCK_TYPES = new Set(['camioGran', 'camioGranFred'])

export const requiresBigTruckLicense = (vehicleType?: string) =>
  BIG_TRUCK_TYPES.has(normalizeTransportType(vehicleType))

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
