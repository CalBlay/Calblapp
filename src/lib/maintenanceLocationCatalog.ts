import { normalizeMaintenanceLocationKey } from '@/lib/maintenanceCenterTravel'

export type MaintenanceCenterLocationRow = {
  id: string
  name: string
  code?: string
  tipus?: string
  internalLocations?: string[]
}

function cleanLocationName(value: unknown) {
  return String(value || '').trim()
}

export function sanitizeMaintenanceInternalLocations(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Map<string, string>()
  for (const item of value) {
    const name = cleanLocationName(item)
    const key = normalizeMaintenanceLocationKey(name)
    if (!name || !key || unique.has(key)) continue
    unique.set(key, name)
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}

export function buildControlledMaintenanceLocations(
  centers: MaintenanceCenterLocationRow[]
): string[] {
  const unique = new Map<string, string>()

  for (const center of centers) {
    if (String(center.tipus || '').trim() === 'propi') {
      const centerName = cleanLocationName(center.name)
      const centerKey = normalizeMaintenanceLocationKey(centerName)
      if (centerName && centerKey && !unique.has(centerKey)) {
        unique.set(centerKey, centerName)
      }
    }

    for (const internalLocation of sanitizeMaintenanceInternalLocations(center.internalLocations)) {
      const locationKey = normalizeMaintenanceLocationKey(internalLocation)
      if (!locationKey || unique.has(locationKey)) continue
      unique.set(locationKey, internalLocation)
    }
  }

  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}

export function getCenterInternalLocations(
  centers: MaintenanceCenterLocationRow[],
  centerName: string
): string[] {
  const key = normalizeMaintenanceLocationKey(centerName)
  const center = centers.find(
    (item) => normalizeMaintenanceLocationKey(item.name) === key
  )
  return sanitizeMaintenanceInternalLocations(center?.internalLocations)
}
