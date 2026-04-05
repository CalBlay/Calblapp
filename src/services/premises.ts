import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export type PremiseCondition = {
  id: string
  locations: string[]
  responsibleId?: string
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

export type SurveyGroupPremise = {
  id: string
  name: string
  workerIds: string[]
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
  surveyGroups?: SurveyGroupPremise[]
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
  surveyGroups: [],
}

const norm = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const RESPONSIBLE_ROLE_KEYS = new Set(['responsable', 'cap departament', 'capdepartament', 'supervisor'])

const normRole = (s?: string | null) => norm(s)

export type DepartmentPersonnelRef = {
  id: string
  name: string
  department: string
  role: string
  isDriver?: boolean
  isJamonero?: boolean
  isResponsible?: boolean
  camioPetit?: boolean
  camioGran?: boolean
  available?: boolean
}

export async function loadDepartmentPersonnel(
  department: string
): Promise<DepartmentPersonnelRef[]> {
  const dept = norm(department)
  if (!dept) return []

  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

  try {
    const lowerSnap = await db.collection('personnel').where('departmentLower', '==', dept).get()
    lowerSnap.docs.forEach((doc) => byId.set(doc.id, doc))
  } catch {}

  try {
    const exactSnap = await db.collection('personnel').where('department', '==', department).get()
    exactSnap.docs.forEach((doc) => byId.set(doc.id, doc))
  } catch {}

  if (byId.size === 0) {
    const fallbackSnap = await db.collection('personnel').get()
    fallbackSnap.docs.forEach((doc) => {
      const data = doc.data() as any
      if (norm(data?.department || data?.departmentLower || '') === dept) {
        byId.set(doc.id, doc)
      }
    })
  }

  return Array.from(byId.values())
    .map((doc) => {
      const data = doc.data() as any
      return {
        id: doc.id,
        name: String(data?.name || '').trim(),
        department: norm(data?.department || ''),
        role: normRole(data?.role || ''),
        isDriver:
          data?.isDriver === true ||
          data?.driver?.isDriver === true ||
          data?.driver?.camioGran === true ||
          data?.driver?.camioPetit === true,
        isJamonero: data?.isJamonero === true,
        isResponsible: data?.isResponsible === true,
        camioPetit: data?.driver?.camioPetit === true,
        camioGran: data?.driver?.camioGran === true,
        available: data?.available !== false,
      }
    })
    .filter((person) => person.department === dept && person.name)
}

async function hydrateConditionResponsibles(
  department: string,
  conditions: PremiseCondition[],
  people?: DepartmentPersonnelRef[]
): Promise<PremiseCondition[]> {
  if (!conditions.length) return conditions

  const resolvedPeople = people || (await loadDepartmentPersonnel(department))

  const resolveByName = (rawName?: string) => {
    const target = norm(rawName || '')
    if (!target) return null

    const exact = resolvedPeople.filter((person) => norm(person.name) === target)
    if (exact.length === 1) return exact[0]

    const startsWith = resolvedPeople.filter((person) => norm(person.name).startsWith(target))
    if (startsWith.length === 1) return startsWith[0]

    const contains = resolvedPeople.filter((person) => norm(person.name).includes(target))
    if (contains.length === 1) return contains[0]

    const preferred = [...exact, ...startsWith, ...contains].filter(
      (person, index, arr) => arr.findIndex((item) => item.id === person.id) === index
    )
    const responsibleOnly = preferred.filter((person) => RESPONSIBLE_ROLE_KEYS.has(person.role))
    if (responsibleOnly.length === 1) return responsibleOnly[0]

    return null
  }

  return conditions.map((condition) => {
    if (condition.responsibleId) return condition
    const matched = resolveByName(condition.responsible)
    if (!matched) return condition
    return {
      ...condition,
      responsibleId: matched.id,
      responsible: matched.name,
    }
  })
}

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
      responsibleId?: unknown
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
      surveyGroups?: Array<{
        id?: string
        name?: unknown
        workerIds?: unknown[]
      }>
  }
): Premises {
  const conditions = Array.isArray(raw?.conditions)
    ? raw.conditions.reduce<PremiseCondition[]>((acc, condition, index) => {
        const locations = Array.isArray(condition?.locations)
          ? condition.locations
              .map((item) => String(item || '').trim())
              .filter(Boolean)
          : []
        const responsible = String(
          condition?.responsible || condition?.worker || ''
        ).trim()
        const responsibleIdValue = String(condition?.responsibleId || '').trim()
        // Firestore rejects undefined; use empty string when no id is set
        if (!locations.length && !responsible && !responsibleIdValue) return acc
        acc.push({
          id: String(condition?.id || makeConditionId({
            locations,
            responsible,
            index,
          })),
          locations,
          responsibleId: responsibleIdValue,
          responsible,
        })
        return acc
      }, [])
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

  const surveyGroups = Array.isArray(raw?.surveyGroups)
    ? raw.surveyGroups
        .map((group, index) => {
          const name = String(group?.name || '').trim()
          const workerIds = Array.isArray(group?.workerIds)
            ? group.workerIds.map((item) => String(item || '').trim()).filter(Boolean)
            : []
          if (!name && workerIds.length === 0) return null
          return {
            id: String(group?.id || `survey-group-${index + 1}`),
            name,
            workerIds: Array.from(new Set(workerIds)),
          }
        })
        .filter((item): item is SurveyGroupPremise => Boolean(item))
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
    surveyGroups,
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
  department: string,
  people?: DepartmentPersonnelRef[]
): Promise<Premises | null> {
  const dept = norm(department)
  if (!dept) return null

  const snap = await db.collection(COLLECTION).doc(dept).get()
  if (!snap.exists) return null

  const normalized = normalizePremises(dept, snap.data() as PremisesDoc)
  return {
    ...normalized,
    conditions: await hydrateConditionResponsibles(
      dept,
      normalized.conditions || [],
      people
    ),
  }
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
  department: string,
  people?: DepartmentPersonnelRef[]
): Promise<{ premises: Premises; warnings: string[] }> {
  const dept = norm(department)
  const warnings: string[] = []

  try {
    const stored = await getStoredPremises(dept, people)
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
