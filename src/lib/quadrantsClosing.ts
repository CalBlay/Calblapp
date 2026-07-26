export type ClosingPersonUpdate = {
  name: string
  role?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
}

export type ClosingQuadrantDoc = {
  id: string
  data: Record<string, unknown>
}

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const normalizeClosingName = (v?: string | null) =>
  unaccent((v || '').toString().trim().toLowerCase())

export const normalizeClosingEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

function matchByName(a?: string, b?: string) {
  return normalizeClosingName(a) === normalizeClosingName(b) && normalizeClosingName(a) !== ''
}

type ClosingRow = Record<string, unknown>

function updateArray(
  arr: ClosingRow[] | undefined,
  updates: ClosingPersonUpdate[],
  setter: (item: ClosingRow, upd: ClosingPersonUpdate) => void
): { next: ClosingRow[] | undefined; matched: number } {
  if (!Array.isArray(arr)) return { next: arr, matched: 0 }
  let matched = 0
  const next = arr.map((item) => {
    const itemName = typeof item.name === 'string' ? item.name : undefined
    const upd = updates.find((u) => matchByName(u.name, itemName))
    if (!upd) return item
    matched += 1
    const cloned = { ...item }
    setter(cloned, upd)
    return cloned
  })
  return { next, matched }
}

/**
 * Prefer docs discovered by `eventId` field (phase / per-day ids like
 * `${eventId}__event__2026-07-20__event`). Fall back to a legacy
 * `collection.doc(eventId)` document only when the field query is empty.
 */
export function selectClosingQuadrantDocs(params: {
  eventId: string
  queriedDocs: ClosingQuadrantDoc[]
  directDoc?: ClosingQuadrantDoc | null
}): ClosingQuadrantDoc[] {
  const eventId = normalizeClosingEventId(params.eventId)
  if (!eventId) return []

  const fromQuery = params.queriedDocs.filter((doc) => {
    const fieldId = normalizeClosingEventId(
      typeof doc.data.eventId === 'string' ? doc.data.eventId : ''
    )
    return fieldId === eventId || doc.id === eventId || doc.id.startsWith(`${eventId}__`)
  })

  if (fromQuery.length > 0) return fromQuery
  if (params.directDoc?.id) return [params.directDoc]
  return []
}

export function applyClosingUpdatesToQuadrantData(params: {
  data: Record<string, unknown>
  updates: ClosingPersonUpdate[]
  department: string
  closeDept?: boolean
  nowIso: string
  userId: string
}): { payload: Record<string, unknown>; matchedPeople: number } {
  const { data, updates, department, closeDept, nowIso, userId } = params

  const setter = (item: ClosingRow, upd: ClosingPersonUpdate) => {
    item.endTimeReal = upd.endTimeReal || null
    item.sortidaNotes = upd.notes || ''
    item.noShow = !!upd.noShow
    item.leftEarly = !!upd.leftEarly
    item.sortidaSetBy = { userId, ts: nowIso }
  }

  const rawResp = data.responsable
  const responsable: ClosingRow[] = Array.isArray(rawResp)
    ? (rawResp as ClosingRow[])
    : rawResp && typeof rawResp === 'object'
      ? [rawResp as ClosingRow]
      : []

  const updatedResponsable = updateArray(responsable, updates, setter)
  const updatedConductors = updateArray(
    Array.isArray(data.conductors) ? (data.conductors as ClosingRow[]) : undefined,
    updates,
    setter
  )
  const updatedTreballadors = updateArray(
    Array.isArray(data.treballadors) ? (data.treballadors as ClosingRow[]) : undefined,
    updates,
    setter
  )
  const updatedWorkers = updateArray(
    Array.isArray(data.workers) ? (data.workers as ClosingRow[]) : undefined,
    updates,
    setter
  )

  const matchedPeople =
    updatedResponsable.matched +
    updatedConductors.matched +
    updatedTreballadors.matched +
    updatedWorkers.matched

  const payload: Record<string, unknown> = {
    updatedAt: nowIso,
  }

  if (updatedResponsable.next) {
    payload.responsable =
      Array.isArray(updatedResponsable.next) && updatedResponsable.next.length === 1
        ? updatedResponsable.next[0]
        : updatedResponsable.next
  }
  if (updatedConductors.next) payload.conductors = updatedConductors.next
  if (updatedTreballadors.next) payload.treballadors = updatedTreballadors.next
  if (updatedWorkers.next) payload.workers = updatedWorkers.next

  if (closeDept) {
    const prevRaw = data.closedByDept
    const prev =
      prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
        ? { ...(prevRaw as Record<string, unknown>) }
        : {}
    payload.closedByDept = {
      ...prev,
      [normalizeClosingName(department)]: nowIso,
    }
  }

  return { payload, matchedPeople }
}
