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

export type MaintenanceResolvedSite = {
  center: string
  location: string
  zone: string
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

type MaintenanceHierarchyCenter = ReturnType<typeof buildMaintenanceCenterHierarchy>[number]

function matchesKey(candidate: string, targetKey: string) {
  const candidateKey = normalizeMaintenanceLocationKey(candidate)
  if (!candidateKey || !targetKey) return false
  return candidateKey === targetKey
}

function includesKey(candidate: string, targetKey: string) {
  const candidateKey = normalizeMaintenanceLocationKey(candidate)
  if (!candidateKey || !targetKey) return false
  return candidateKey.includes(targetKey) || targetKey.includes(candidateKey)
}

function resolveSiteAgainstHierarchy(
  hierarchy: MaintenanceHierarchyCenter[],
  rawValue: string,
  matcher: (candidate: string, targetKey: string) => boolean
): MaintenanceResolvedSite | null {
  const targetKey = normalizeMaintenanceLocationKey(rawValue)
  if (!targetKey) return null

  for (const center of hierarchy) {
    if (matcher(center.name, targetKey) || matcher(center.code || '', targetKey)) {
      return { center: center.name, location: '', zone: '' }
    }
    for (const location of center.locations) {
      if (matcher(location.name, targetKey)) {
        return { center: center.name, location: location.name, zone: '' }
      }
      for (const zone of location.zones) {
        if (matcher(zone, targetKey)) {
          return { center: center.name, location: location.name, zone }
        }
      }
    }
  }

  return null
}

export function resolveMaintenanceSite(
  centers: MaintenanceCenterHierarchyRow[],
  ...values: Array<string | null | undefined>
): MaintenanceResolvedSite {
  const hierarchy = buildMaintenanceCenterHierarchy(centers)
  for (const rawValue of values) {
    const value = String(rawValue || '').trim()
    if (!value) continue

    const direct = resolveSiteAgainstHierarchy(hierarchy, value, matchesKey)
    if (direct) return direct
  }

  for (const rawValue of values) {
    const value = String(rawValue || '').trim()
    if (!value) continue

    const fuzzy = resolveSiteAgainstHierarchy(hierarchy, value, includesKey)
    if (fuzzy) return fuzzy
  }

  return { center: '', location: '', zone: '' }
}

export function getMaintenanceCenterOptions(
  centers: MaintenanceCenterHierarchyRow[]
): string[] {
  return buildMaintenanceCenterHierarchy(centers).map((center) => center.name)
}

export function getMaintenanceLocationsForCenter(
  centers: MaintenanceCenterHierarchyRow[],
  centerName?: string | null
): string[] {
  const hierarchy = buildMaintenanceCenterHierarchy(centers)
  const centerKey = normalizeMaintenanceLocationKey(centerName)
  if (!centerKey) {
    const unique = new Map<string, string>()
    hierarchy.forEach((center) => {
      center.locations.forEach((location) => {
        const key = normalizeMaintenanceLocationKey(location.name)
        if (!key || unique.has(key)) return
        unique.set(key, location.name)
      })
    })
    return [...unique.values()].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
  }

  return hierarchy
    .filter((center) => normalizeMaintenanceLocationKey(center.name) === centerKey)
    .flatMap((center) => center.locations.map((location) => location.name))
}

export function getMaintenanceZones(
  centers: MaintenanceCenterHierarchyRow[],
  centerName?: string | null,
  locationName?: string | null
): string[] {
  const hierarchy = buildMaintenanceCenterHierarchy(centers)
  const centerKey = normalizeMaintenanceLocationKey(centerName)
  const locationKey = normalizeMaintenanceLocationKey(locationName)

  const unique = new Map<string, string>()
  hierarchy
    .filter((center) => !centerKey || normalizeMaintenanceLocationKey(center.name) === centerKey)
    .forEach((center) => {
      center.locations
        .filter((location) => !locationKey || normalizeMaintenanceLocationKey(location.name) === locationKey)
        .forEach((location) => {
          location.zones.forEach((zone) => {
            const key = normalizeMaintenanceLocationKey(zone)
            if (!key || unique.has(key)) return
            unique.set(key, zone)
          })
        })
    })
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}

export function matchesMaintenanceSiteFilters(
  centers: MaintenanceCenterHierarchyRow[],
  filters: {
    center?: string | null
    location?: string | null
    zone?: string | null
  },
  ...values: Array<string | null | undefined>
): boolean {
  const center = String(filters.center || '').trim()
  const location = String(filters.location || '').trim()
  const zone = String(filters.zone || '').trim()
  if (!center && !location && !zone) return true

  const resolved = resolveMaintenanceSite(centers, ...values)
  if (center && normalizeMaintenanceLocationKey(resolved.center) !== normalizeMaintenanceLocationKey(center)) {
    return false
  }
  if (location && normalizeMaintenanceLocationKey(resolved.location) !== normalizeMaintenanceLocationKey(location)) {
    return false
  }
  if (zone && normalizeMaintenanceLocationKey(resolved.zone) !== normalizeMaintenanceLocationKey(zone)) {
    return false
  }
  return true
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
