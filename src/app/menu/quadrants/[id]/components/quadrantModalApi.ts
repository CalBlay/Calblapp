import type { DriverCrewPremise } from '@/services/premises'
import type {
  PremisesResponse,
  SubmitQuadrantResponse,
  SurveyPersonApi,
} from './quadrantModalTypes'

const surveyPremisesCache = new Map<string, Array<{ id: string; name: string; workerIds: string[] }>>()
const surveyPremisesModelsCache = new Map<string, string[]>()
const surveyPremisesDriverCrewsCache = new Map<string, DriverCrewPremise[]>()
const surveyPremisesPromiseCache = new Map<
  string,
  Promise<{
    groups: Array<{ id: string; name: string; workerIds: string[] }>
    vestimentModels: string[]
    driverCrews: DriverCrewPremise[]
  }>
>()
const surveyPeopleCache = new Map<string, Array<{ id: string; name: string }>>()
const surveyPeoplePromiseCache = new Map<string, Promise<Array<{ id: string; name: string }>>>()

export const getCachedSurveyGroups = (department: string) => surveyPremisesCache.get(department)
export const getCachedSurveyPeople = (department: string) => surveyPeopleCache.get(department)

export const submitQuadrantPayload = async (payload: Record<string, unknown>) => {
  const res = await fetch('/api/quadrants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data: SubmitQuadrantResponse
  try {
    data = text ? (JSON.parse(text) as SubmitQuadrantResponse) : {}
  } catch {
    throw new Error('Resposta invàlida del servidor')
  }

  if (!res.ok || data.ok === false || data.success === false) {
    throw new Error(data.error || 'Error desant el quadrant')
  }

  return data
}

export const confirmSavedQuadrants = async (params: {
  department: string
  eventId: string
  docIds: string[]
}) => {
  const res = await fetch('/api/quadrants/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      department: params.department,
      eventId: params.eventId,
      docIds: params.docIds,
    }),
  })
  const text = await res.text()
  let data: { ok?: boolean; error?: string }
  try {
    data = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {}
  } catch {
    return { ok: false as const, error: 'Resposta invàlida del servidor' }
  }
  if (!res.ok || data.ok === false) {
    return { ok: false as const, error: data.error || `Error ${res.status}` }
  }
  return { ok: true as const }
}

export const deleteQuadrantDraft = async (params: {
  department: string
  eventId: string
  phaseKey?: string
}) => {
  const res = await fetch('/api/quadrantsDraft/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      department: params.department,
      eventId: params.eventId,
      phaseKey: params.phaseKey,
    }),
  })
  const text = await res.text()
  let data: { ok?: boolean; error?: string }
  try {
    data = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {}
  } catch {
    throw new Error('Resposta invàlida del servidor')
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Error ${res.status}`)
  }
  return data
}

export const loadDepartmentPremises = async (department: string) => {
  const cachedGroups = surveyPremisesCache.get(department)
  const cachedModels = surveyPremisesModelsCache.get(department)
  const cachedDriverCrews = surveyPremisesDriverCrewsCache.get(department)
  if (cachedGroups && cachedModels && cachedDriverCrews) {
    return { groups: cachedGroups, vestimentModels: cachedModels, driverCrews: cachedDriverCrews }
  }

  let request = surveyPremisesPromiseCache.get(department)
  if (!request) {
    request = fetch(`/api/quadrants/premises?department=${encodeURIComponent(department)}`)
      .then((res) => res.json().catch(() => ({} as PremisesResponse)))
      .then((json: PremisesResponse) => {
        const groups = Array.isArray(json?.premises?.surveyGroups)
          ? json.premises.surveyGroups
          : []
        const vestimentModels = Array.isArray(json?.premises?.vestimentModels)
          ? json.premises.vestimentModels
              .map((m) => String(m || '').trim())
              .filter(Boolean)
          : []
        const driverCrews = Array.isArray(json?.premises?.driverCrews)
          ? json.premises.driverCrews
              .map((crew, index) => ({
                id: String(crew?.id || `crew-${index}`),
                driverId: String(crew?.driverId || '').trim(),
                driverName: String(crew?.driverName || '').trim(),
                companions: Array.isArray(crew?.companions)
                  ? crew.companions.map((companion) => ({
                      id: String(companion?.id || '').trim(),
                      name: String(companion?.name || '').trim(),
                    }))
                  : [],
              }))
              .filter((crew) => crew.driverId || crew.driverName || crew.companions.length > 0)
          : []
        surveyPremisesCache.set(department, groups)
        surveyPremisesModelsCache.set(department, vestimentModels)
        surveyPremisesDriverCrewsCache.set(department, driverCrews)
        return { groups, vestimentModels, driverCrews }
      })
      .finally(() => {
        surveyPremisesPromiseCache.delete(department)
      })
    surveyPremisesPromiseCache.set(department, request)
  }

  return request
}

export const loadSurveyPeople = async (department: string) => {
  const cachedPeople = surveyPeopleCache.get(department)
  if (cachedPeople) return cachedPeople

  let request = surveyPeoplePromiseCache.get(department)
  if (!request) {
    request = fetch(`/api/quadrants/premises/personnel?department=${encodeURIComponent(department)}`)
      .then((res) => res.json().catch(() => ({})))
      .then((peopleJson) =>
        Array.isArray(peopleJson?.people)
          ? peopleJson.people.map((person: SurveyPersonApi) => ({
              id: String(person?.id || ''),
              name: String(person?.name || ''),
            }))
          : []
      )
      .finally(() => {
        surveyPeoplePromiseCache.delete(department)
      })
    surveyPeoplePromiseCache.set(department, request)
  }

  const people = await request
  surveyPeopleCache.set(department, people)
  return people
}
