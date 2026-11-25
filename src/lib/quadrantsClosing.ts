export type ClosingPersonUpdate = {
  id?: string
  name: string
  role?: string
  startTimeReal?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  lateArrival?: boolean
  leftEarly?: boolean
}

export type ClosingQuadrantDoc = {
  id: string
  data: Record<string, unknown>
}

export type ClosingPersonState = {
  startTimeReal: string
  endTimeReal: string
  notes: string
  noShow: boolean
  lateArrival: boolean
  leftEarly: boolean
}

export type ClosingAuditChange = {
  personId?: string
  personName: string
  role: string
  before: ClosingPersonState
  after: ClosingPersonState
  isCorrection: boolean
  revision: number
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

const closingRowId = (row: ClosingRow) =>
  String(row.id || row.personId || row.workerId || row.uid || '').trim()

function matchesClosingUpdate(update: ClosingPersonUpdate, row: ClosingRow) {
  const updateId = String(update.id || '').trim()
  const rowId = closingRowId(row)
  if (updateId) return Boolean(rowId && updateId === rowId)
  const rowName =
    typeof row.name === 'string'
      ? row.name
      : typeof row.personName === 'string'
        ? row.personName
        : undefined
  return matchByName(update.name, rowName)
}

function updateArray(
  arr: ClosingRow[] | undefined,
  updates: ClosingPersonUpdate[],
  setter: (item: ClosingRow, upd: ClosingPersonUpdate) => void
): { next: ClosingRow[] | undefined; matched: number } {
  if (!Array.isArray(arr)) return { next: arr, matched: 0 }
  let matched = 0
  const next = arr.map((item) => {
    const upd = updates.find((update) => matchesClosingUpdate(update, item))
    if (!upd) return item
    matched += 1
    const cloned = { ...item }
    setter(cloned, upd)
    return cloned
  })
  return { next, matched }
}

function updateGroupRoleLines(
  groups: ClosingRow[] | undefined,
  updates: ClosingPersonUpdate[],
  setter: (item: ClosingRow, upd: ClosingPersonUpdate) => void
) {
  if (!Array.isArray(groups)) return { next: groups, matched: 0 }
  let matched = 0
  const next = groups.map((group) => {
    if (!Array.isArray(group.roleLines)) return group
    const roleLines = (group.roleLines as ClosingRow[]).map((line) => {
      const update = updates.find((item) => matchesClosingUpdate(item, line))
      if (!update) return line
      matched += 1
      const cloned = { ...line }
      setter(cloned, update)
      return cloned
    })
    return { ...group, roleLines }
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
  quadrantId?: string | null
  phaseType?: string | null
}): ClosingQuadrantDoc[] {
  const eventId = normalizeClosingEventId(params.eventId)
  if (!eventId) return []

  const fromQuery = params.queriedDocs.filter((doc) => {
    const fieldId = normalizeClosingEventId(
      typeof doc.data.eventId === 'string' ? doc.data.eventId : ''
    )
    return fieldId === eventId || doc.id === eventId || doc.id.startsWith(`${eventId}__`)
  })

  const quadrantId = String(params.quadrantId || '').trim()
  if (quadrantId) {
    const exact = fromQuery.find((doc) => doc.id === quadrantId)
    if (exact) return [exact]
    return params.directDoc?.id === quadrantId ? [params.directDoc] : []
  }

  const candidates = fromQuery.length > 0
    ? fromQuery
    : params.directDoc?.id
      ? [params.directDoc]
      : []

  const phaseType = normalizeClosingName(params.phaseType)
  if (!phaseType) return candidates
  const explicit = candidates.filter((doc) =>
    normalizeClosingName(String(doc.data.phaseType || doc.data.phaseLabel || '')) === phaseType
  )
  if (explicit.length > 0) return explicit
  return candidates.filter(
    (doc) => !normalizeClosingName(String(doc.data.phaseType || doc.data.phaseLabel || ''))
  )
}

export function applyClosingUpdatesToQuadrantData(params: {
  data: Record<string, unknown>
  updates: ClosingPersonUpdate[]
  department: string
  closeDept?: boolean
  nowIso: string
  userId: string
  userName?: string
  correctionReason?: string
}): { payload: Record<string, unknown>; matchedPeople: number; changes: ClosingAuditChange[] } {
  const {
    data,
    updates,
    department,
    closeDept,
    nowIso,
    userId,
    userName = '',
    correctionReason = '',
  } = params
  const changesByPerson = new Map<string, ClosingAuditChange>()

  const stateOf = (item: ClosingRow): ClosingPersonState => ({
    startTimeReal: String(item.startTimeReal || ''),
    endTimeReal: String(item.endTimeReal || ''),
    notes: String(item.sortidaNotes || ''),
    noShow: item.noShow === true,
    lateArrival: item.lateArrival === true,
    leftEarly: item.leftEarly === true,
  })

  const setter = (item: ClosingRow, upd: ClosingPersonUpdate) => {
    const before = stateOf(item)
    const hadPreviousSetBy = Boolean(
      item.sortidaSetBy && typeof item.sortidaSetBy === 'object'
    )
    const noShow = !!upd.noShow
    const lateArrival = !noShow && !!upd.lateArrival
    item.startTimeReal = lateArrival ? upd.startTimeReal || null : null
    item.endTimeReal = upd.endTimeReal || null
    item.sortidaNotes = upd.notes || ''
    item.noShow = noShow
    item.lateArrival = lateArrival
    item.leftEarly = !!upd.leftEarly
    item.sortidaSetBy = { userId, ts: nowIso }
    const after = stateOf(item)
    if (JSON.stringify(before) === JSON.stringify(after)) return

    const hadPreviousClosing =
      hadPreviousSetBy ||
      Boolean(item.closingRevision) ||
      Boolean(before.startTimeReal) ||
      Boolean(before.endTimeReal) ||
      Boolean(before.notes) ||
      before.noShow ||
      before.lateArrival ||
      before.leftEarly
    const revision = Math.max(0, Number(item.closingRevision) || 0) + 1
    item.closingRevision = revision
    item.closingChangedAt = nowIso
    item.closingChangedBy = { userId, userName }
    if (hadPreviousClosing) {
      item.closingCorrection = {
        reason: correctionReason.trim(),
        userId,
        userName,
        ts: nowIso,
      }
    }

    const change: ClosingAuditChange = {
      personId: String(upd.id || closingRowId(item) || '') || undefined,
      personName: String(upd.name || ''),
      role: String(upd.role || ''),
      before,
      after,
      isCorrection: hadPreviousClosing,
      revision,
    }
    const key = String(upd.id || closingRowId(item) || normalizeClosingName(upd.name))
    const previous = changesByPerson.get(key)
    if (!previous || (!previous.isCorrection && change.isCorrection)) {
      changesByPerson.set(key, change)
    }
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
  const updatedExternalWorkers = updateArray(
    Array.isArray(data.externalWorkers) ? (data.externalWorkers as ClosingRow[]) : undefined,
    updates,
    setter
  )
  const updatedGroups = updateGroupRoleLines(
    Array.isArray(data.groups) ? (data.groups as ClosingRow[]) : undefined,
    updates,
    setter
  )

  const matchedPeople =
    updatedResponsable.matched +
    updatedConductors.matched +
    updatedTreballadors.matched +
    updatedWorkers.matched +
    updatedExternalWorkers.matched +
    updatedGroups.matched

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
  if (updatedExternalWorkers.next) payload.externalWorkers = updatedExternalWorkers.next
  if (updatedGroups.next) payload.groups = updatedGroups.next

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

  return { payload, matchedPeople, changes: Array.from(changesByPerson.values()) }
}
