import type {
  PremisesResponse,
  SubmitQuadrantResponse,
  SurveyPersonApi,
} from './quadrantModalTypes'

const surveyPremisesCache = new Map<string, Array<{ id: string; name: string; workerIds: string[] }>>()
const surveyPremisesModelsCache = new Map<string, string[]>()
const surveyPremisesPromiseCache = new Map<
  string,
  Promise<{
    groups: Array<{ id: string; name: string; workerIds: string[] }>
    vestimentModels: string[]
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

export const loadDepartmentPremises = async (department: string) => {
  const cachedGroups = surveyPremisesCache.get(department)
  const cachedModels = surveyPremisesModelsCache.get(department)
  if (cachedGroups && cachedModels) {
    return { groups: cachedGroups, vestimentModels: cachedModels }
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
        surveyPremisesCache.set(department, groups)
        surveyPremisesModelsCache.set(department, vestimentModels)
        return { groups, vestimentModels }
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
