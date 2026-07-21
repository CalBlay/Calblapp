import { normalizeMaintenanceLocationKey } from '@/lib/maintenanceCenterTravel'

export type MaintenanceCenterLocationRow = {
  id: string
  name: string
  code?: string
  tipus?: string
  internalLocations?: string[]
  locationNodes?: MaintenanceLocationNode[]
}

export type MaintenanceLocationNode = {
  name: string
  zones?: string[]
}

export type MaintenanceCenterHierarchyRow = {
  id: string
  name: string
  code?: string
  tipus?: string
  locationNodes?: MaintenanceLocationNode[]
}

function cleanLocationName(value: unknown) {
  return String(value || '').trim()
}

export function sanitizeMaintenanceZones(value: unknown): string[] {
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

export function sanitizeMaintenanceLocationNodes(
  value: unknown,
  fallbackInternalLocations?: unknown
): MaintenanceLocationNode[] {
  const source = Array.isArray(value) ? value : []
  const unique = new Map<string, MaintenanceLocationNode>()

  for (const item of source) {
    const record =
      item && typeof item === 'object' ? (item as Record<string, unknown>) : null
    const name = cleanLocationName(record?.name)
    const key = normalizeMaintenanceLocationKey(name)
    if (!name || !key || unique.has(key)) continue
    unique.set(key, {
      name,
      zones: sanitizeMaintenanceZones(record?.zones),
    })
  }

  if (unique.size === 0) {
    for (const location of sanitizeMaintenanceInternalLocations(fallbackInternalLocations)) {
      const key = normalizeMaintenanceLocationKey(location)
      if (!key || unique.has(key)) continue
      unique.set(key, { name: location, zones: [] })
    }
  }

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
}

export function flattenMaintenanceLocationNodes(
  locationNodes: MaintenanceLocationNode[] | undefined
): string[] {
  if (!Array.isArray(locationNodes)) return []
  return sanitizeMaintenanceInternalLocations(locationNodes.map((item) => item.name))
}

export function buildMaintenanceCenterHierarchy(
  centers: MaintenanceCenterHierarchyRow[]
): Array<{
  id: string
  name: string
  code?: string
  tipus?: string
  locations: Array<{ name: string; zones: string[] }>
}> {
  return centers
    .map((center) => ({
      id: center.id,
      name: cleanLocationName(center.name),
      code: cleanLocationName(center.code),
      tipus: cleanLocationName(center.tipus),
      locations: sanitizeMaintenanceLocationNodes(center.locationNodes).map((location) => ({
        name: location.name,
        zones: sanitizeMaintenanceZones(location.zones),
      })),
    }))
    .filter((center) => center.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
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

    const internalLocations = center.locationNodes?.length
      ? flattenMaintenanceLocationNodes(center.locationNodes)
      : sanitizeMaintenanceInternalLocations(center.internalLocations)

    for (const internalLocation of internalLocations) {
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
  if (!center) return []
  if (center.locationNodes?.length) return flattenMaintenanceLocationNodes(center.locationNodes)
  return sanitizeMaintenanceInternalLocations(center.internalLocations)
}
