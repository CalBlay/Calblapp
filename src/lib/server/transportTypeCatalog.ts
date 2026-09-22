import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  DEFAULT_TRANSPORT_TYPE_DEFINITIONS,
  type TransportTypeDefinition,
} from '@/lib/transportTypes'

export const TRANSPORT_TYPES_COLLECTION = 'transport_types'

type StoredTransportType = Partial<Omit<TransportTypeDefinition, 'value' | 'fromDefaults'>> & {
  deleted?: boolean
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export async function readTransportTypeCatalog(options?: {
  includeInactive?: boolean
}): Promise<TransportTypeDefinition[]> {
  const snapshot = await firestoreAdmin.collection(TRANSPORT_TYPES_COLLECTION).get()
  const stored = new Map(
    snapshot.docs.map((doc) => [doc.id, doc.data() as StoredTransportType])
  )
  const result = new Map<string, TransportTypeDefinition>()

  DEFAULT_TRANSPORT_TYPE_DEFINITIONS.forEach((definition) => {
    const override = stored.get(definition.value)
    stored.delete(definition.value)
    if (override?.deleted === true) return
    result.set(definition.value, {
      ...definition,
      label:
        typeof override?.label === 'string' && override.label.trim()
          ? override.label.trim()
          : definition.label,
      active: typeof override?.active === 'boolean' ? override.active : definition.active,
      sortOrder: finiteNumber(override?.sortOrder, definition.sortOrder),
      requiresLargeTruckLicense:
        typeof override?.requiresLargeTruckLicense === 'boolean'
          ? override.requiresLargeTruckLicense
          : definition.requiresLargeTruckLicense,
      refrigeratedByDefault:
        typeof override?.refrigeratedByDefault === 'boolean'
          ? override.refrigeratedByDefault
          : definition.refrigeratedByDefault,
      tachographRequired:
        typeof override?.tachographRequired === 'boolean'
          ? override.tachographRequired
          : definition.tachographRequired,
      serviceIntervalKm: Math.max(
        0,
        finiteNumber(override?.serviceIntervalKm, definition.serviceIntervalKm)
      ),
      fromDefaults: true,
    })
  })

  stored.forEach((data, value) => {
    if (data.deleted === true) return
    const label = typeof data.label === 'string' ? data.label.trim() : ''
    if (!label) return
    result.set(value, {
      value,
      label,
      active: data.active !== false,
      sortOrder: finiteNumber(data.sortOrder, 999),
      requiresLargeTruckLicense: data.requiresLargeTruckLicense === true,
      refrigeratedByDefault: data.refrigeratedByDefault === true,
      tachographRequired: data.tachographRequired === true,
      serviceIntervalKm: Math.max(0, finiteNumber(data.serviceIntervalKm, 20000)),
      fromDefaults: false,
    })
  })

  return Array.from(result.values())
    .filter((definition) => options?.includeInactive || definition.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'ca'))
}
