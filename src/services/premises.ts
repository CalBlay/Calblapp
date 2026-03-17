import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export type PremiseCondition = {
  id: string
  locations: string[]
  responsible: string
}

export type DriverCrewCompanion = {
  id: string
  name: string
}

export type DriverCrewPremise = {
  id: string
  driverId: string
  driverName: string
  companions: DriverCrewCompanion[]
}

export type Premises = {
  department: string
  defaultCharacteristics?: string[]
  restHours: number
  allowMultipleEventsSameDay: boolean
  maxFirstEventDurationHours?: number
  requireResponsible?: boolean
  conditions?: PremiseCondition[]
  driverCrews?: DriverCrewPremise[]
}

type PremisesDoc = Premises & {
  updatedAt?: Date | string | { toDate?: () => Date }
  updatedBy?: string
}

const COLLECTION = 'quadrantPremises'

const DEFAULTS: Premises = {
  department: '',
  restHours: 8,
  allowMultipleEventsSameDay: true,
  maxFirstEventDurationHours: 24,
  requireResponsible: true,
  conditions: [],
  driverCrews: [],
}

const norm = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const makeConditionId = (input: {
  locations?: unknown
  responsible?: unknown
  index: number
}) => {
  const locationKey = Array.isArray(input.locations)
    ? input.locations
        .map((item) => norm(String(item || '')))
        .filter(Boolean)
        .join('-')
    : ''
  const responsibleKey = norm(String(input.responsible || ''))
  return [locationKey || 'sense-ubicacio', responsibleKey || 'sense-responsable', input.index]
    .filter(Boolean)
    .join('__')
}

export function normalizePremises(
  department: string,
  raw?: Omit<Partial<Premises>, 'conditions'> & {
    conditions?: Array<{
      id?: string
      locations?: unknown
      responsible?: unknown
      worker?: unknown
    }>
    driverCrews?: Array<{
      id?: string
      driverId?: unknown
      driverName?: unknown
      companions?: Array<{
        id?: unknown
        name?: unknown
      }>
    }>
  }
): Premises {
  const conditions = Array.isArray(raw?.conditions)
    ? raw.conditions
        .map((condition, index) => {
          const locations = Array.isArray(condition?.locations)
            ? condition.locations
                .map((item) => String(item || '').trim())
                .filter(Boolean)
            : []
          const responsible = String(
            condition?.responsible || condition?.worker || ''
          ).trim()
          if (!locations.length && !responsible) return null
          return {
            id: String(condition?.id || makeConditionId({
              locations,
              responsible,
              index,
            })),
            locations,
            responsible,
          }
        })
        .filter((item): item is PremiseCondition => Boolean(item))
    : []

  const driverCrews = Array.isArray(raw?.driverCrews)
    ? raw.driverCrews
        .map((crew, index) => {
          const driverId = String(crew?.driverId || '').trim()
          const driverName = String(crew?.driverName || '').trim()
          const companions = Array.isArray(crew?.companions)
            ? crew.companions
                .map((companion) => ({
                  id: String(companion?.id || '').trim(),
                  name: String(companion?.name || '').trim(),
                }))
                .filter((companion) => companion.id || companion.name)
            : []

          if (!driverId && !driverName && companions.length === 0) return null

          return {
            id: String(crew?.id || `driver-crew-${index + 1}`),
            driverId,
            driverName,
            companions,
          }
        })
        .filter((item): item is DriverCrewPremise => Boolean(item))
    : []

  return {
    ...DEFAULTS,
    ...raw,
    department: norm(department),
    defaultCharacteristics: Array.isArray(raw?.defaultCharacteristics)
      ? raw.defaultCharacteristics.map((item) => String(item || '').trim()).filter(Boolean)
      : DEFAULTS.defaultCharacteristics,
    restHours: Number(raw?.restHours ?? DEFAULTS.restHours),
    allowMultipleEventsSameDay:
      typeof raw?.allowMultipleEventsSameDay === 'boolean'
        ? raw.allowMultipleEventsSameDay
        : DEFAULTS.allowMultipleEventsSameDay,
    maxFirstEventDurationHours: Number(
      raw?.maxFirstEventDurationHours ?? DEFAULTS.maxFirstEventDurationHours
    ),
    requireResponsible:
      typeof raw?.requireResponsible === 'boolean'
        ? raw.requireResponsible
        : DEFAULTS.requireResponsible,
    conditions,
    driverCrews,
  }
}

async function loadPremisesFromJson(
  department: string
): Promise<{ premises: Premises; warnings: string[] }> {
  const dept = norm(department)
  const warnings: string[] = []
  try {
    const mod = await import(`@/data/premises-${dept}.json`)
    return {
      premises: normalizePremises(dept, mod.default as Partial<Premises>),
      warnings,
    }
  } catch {
    warnings.push('no_premises')
    return {
      premises: normalizePremises(dept, { department: dept }),
      warnings,
    }
  }
}

export async function getStoredPremises(
  department: string
): Promise<Premises | null> {
  const dept = norm(department)
  if (!dept) return null

  const snap = await db.collection(COLLECTION).doc(dept).get()
  if (!snap.exists) return null

  return normalizePremises(dept, snap.data() as PremisesDoc)
}

export async function savePremises(
  department: string,
  input: Partial<Premises>,
  updatedBy?: string
): Promise<Premises> {
  const dept = norm(department)
  const premises = normalizePremises(dept, {
    ...input,
    department: dept,
  })

  await db.collection(COLLECTION).doc(dept).set(
    {
      ...premises,
      updatedAt: new Date(),
      updatedBy: updatedBy || null,
    },
    { merge: true }
  )

  return premises
}

export async function loadPremises(
  department: string
): Promise<{ premises: Premises; warnings: string[] }> {
  const dept = norm(department)
  const warnings: string[] = []

  try {
    const stored = await getStoredPremises(dept)
    if (stored) return { premises: stored, warnings }
  } catch {
    warnings.push('premises_store_unavailable')
  }

  const fallback = await loadPremisesFromJson(dept)
  return {
    premises: fallback.premises,
    warnings: [...warnings, ...fallback.warnings],
  }
}
