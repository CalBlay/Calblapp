import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  defaultServiceCostConfig,
  emptyDepartments,
  normalizeDepartmentBlock,
  normalizeFuelConfig,
} from './defaults'
import { recomputeSheet } from './calc'
import type { ServiceCostConfig, ServiceCostSheet } from './types'
import { COST_SERVEIS_DEPARTMENTS } from './types'

export const SERVICE_COST_CONFIG_DOC = 'serviceCostConfig/default'
export const SERVICE_COST_SHEETS_COL = 'serviceCostSheets'

export async function getServiceCostConfig(): Promise<ServiceCostConfig> {
  const snap = await db.doc(SERVICE_COST_CONFIG_DOC).get()
  const base = defaultServiceCostConfig()
  if (!snap.exists) return base
  const data = snap.data() || {}

  const mergeDeparture = (
    dept: 'logistica' | 'serveis' | 'cuina'
  ): ServiceCostConfig['departures']['logistica'] => {
    const saved = (data.departures?.[dept] || {}) as Partial<
      ServiceCostConfig['departures']['logistica']
    >
    const merged = { ...base.departures[dept], ...saved }
    // No deixar adreça/label buits trepitjant els defaults
    if (!String(merged.address || '').trim()) merged.address = base.departures[dept].address
    if (!String(merged.label || '').trim()) merged.label = base.departures[dept].label
    if (merged.lat == null) merged.lat = base.departures[dept].lat
    if (merged.lng == null) merged.lng = base.departures[dept].lng
    return merged
  }

  return {
    hourlyRates: {
      ...base.hourlyRates,
      ...(data.hourlyRates || {}),
    },
    departures: {
      logistica: mergeDeparture('logistica'),
      serveis: mergeDeparture('serveis'),
      cuina: mergeDeparture('cuina'),
    },
    fuel: normalizeFuelConfig(data.fuel),
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  }
}

export async function saveServiceCostConfig(
  config: ServiceCostConfig,
  userId: string
): Promise<ServiceCostConfig> {
  const payload = {
    hourlyRates: config.hourlyRates,
    departures: config.departures,
    fuel: config.fuel,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }
  await db.doc(SERVICE_COST_CONFIG_DOC).set(payload, { merge: true })
  return { ...config, ...payload }
}

function normalizeSheetDepartments(
  departments: ServiceCostSheet['departments'] | undefined
): ServiceCostSheet['departments'] {
  const base = emptyDepartments()
  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    base[dept] = normalizeDepartmentBlock(departments?.[dept])
  }
  return base
}

export async function getServiceCostSheet(eventId: string): Promise<ServiceCostSheet | null> {
  const snap = await db.collection(SERVICE_COST_SHEETS_COL).doc(eventId).get()
  if (!snap.exists) return null
  const data = snap.data() as ServiceCostSheet
  return {
    ...data,
    serviceType: String(data.serviceType || ''),
    departments: normalizeSheetDepartments(data.departments),
  }
}

export async function upsertServiceCostSheet(
  sheet: ServiceCostSheet,
  userId: string
): Promise<ServiceCostSheet> {
  const config = await getServiceCostConfig()
  const normalized: ServiceCostSheet = {
    ...sheet,
    departments: normalizeSheetDepartments(sheet.departments),
  }
  const computed = recomputeSheet(normalized, config.hourlyRates, config.fuel)
  const payload: ServiceCostSheet = {
    ...computed,
    departments: computed.departments || emptyDepartments(),
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }
  await db.collection(SERVICE_COST_SHEETS_COL).doc(sheet.eventId).set(payload, { merge: true })
  return payload
}

export async function listServiceCostSheetsByDateRange(
  fromDay: string,
  toDay: string
): Promise<ServiceCostSheet[]> {
  const snap = await db
    .collection(SERVICE_COST_SHEETS_COL)
    .where('eventDate', '>=', fromDay)
    .where('eventDate', '<=', toDay)
    .get()
  return snap.docs.map((d) => d.data() as ServiceCostSheet)
}
