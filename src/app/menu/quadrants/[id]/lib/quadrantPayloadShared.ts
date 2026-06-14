import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type {
  ExternalWorkerPayload,
  QuadrantMode,
  TimetableEntry,
} from '../components/quadrantModalTypes'
import { collectTimetable, splitTitle } from '../components/quadrantModalUtils'

export type IdName = { id: string; name?: string }

const normResponsibleKey = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Reserva ids de persones per fila de rol; el conductor pot coincidir amb el responsable de la capçalera. */
export function buildReservedForRoleLine(
  baseReserved: Set<string>,
  line: { role: string; personId?: string },
  manualResponsibleId?: string
): Set<string> {
  const normalize = (value?: string) => String(value || '').trim().toLowerCase()
  const next = new Set([...baseReserved].filter((id) => id !== normalize(line.personId)))
  const manualId = normalize(manualResponsibleId)
  if (
    manualId &&
    manualId !== '__auto__' &&
    manualId !== '__manual_pick__' &&
    (line.role === 'conductor' || line.role === 'responsable')
  ) {
    next.delete(manualId)
  }
  return next
}

/** Llegeix responsable des del borrador (capçalera + grup; inclou conductor=responsable). */
export function extractDraftResponsible(draft: {
  responsableId?: string
  responsableName?: string | Record<string, unknown>
  responsable?: { id?: string; name?: string } | null
  conductors?: Array<{ id?: string; name?: string } | null>
  groups?: Array<{
    wantsResponsible?: boolean
    responsibleId?: string | null
    responsibleName?: string | null
    driverId?: string | null
    driverName?: string | null
  }>
}): { id: string; name: string } {
  const resolveNameById = (id: string) => {
    if (!id) return ''
    const fromConductors = (draft.conductors || []).find(
      (person) => String(person?.id || '').trim() === id
    )
    return String(fromConductors?.name || '').trim()
  }

  const topId = String(draft.responsableId || draft.responsable?.id || '').trim()
  const topName =
    typeof draft.responsableName === 'string'
      ? draft.responsableName.trim()
      : typeof draft.responsable?.name === 'string'
      ? draft.responsable.name.trim()
      : ''

  const groups = Array.isArray(draft.groups) ? draft.groups : []
  const groupWithResponsible = groups.find((group) => {
    if (group.wantsResponsible === false) return false
    return Boolean(String(group.responsibleId || '').trim() || String(group.responsibleName || '').trim())
  })

  let groupId = String(groupWithResponsible?.responsibleId || '').trim()
  let groupName = String(groupWithResponsible?.responsibleName || '').trim()

  if (!groupId && !groupName) {
    const samePersonGroup = groups.find((group) => {
      if (group.wantsResponsible === false) return false
      const rid = String(group.responsibleId || '').trim()
      const did = String(group.driverId || '').trim()
      return Boolean(rid && did && rid === did)
    })
    if (samePersonGroup) {
      groupId = String(samePersonGroup.responsibleId || samePersonGroup.driverId || '').trim()
      groupName = String(
        samePersonGroup.responsibleName || samePersonGroup.driverName || resolveNameById(groupId)
      ).trim()
    }
  }

  const id = topId || groupId
  const name = topName || groupName || resolveNameById(id)

  return { id, name }
}

/** Pools on pot aparèixer el responsable (responsables + conductors quan és la mateixa persona). */
export function mergeResponsibleCandidatePools(
  responsables: IdName[],
  conductors: IdName[] = []
): IdName[] {
  const seen = new Set<string>()
  const merged: IdName[] = []
  for (const person of [...responsables, ...conductors]) {
    const id = String(person.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    merged.push(person)
  }
  return merged
}

const looksLikePersonId = (value: string) =>
  /^[a-zA-Z0-9_-]{8,}$/.test(value) && !value.includes(' ')

export type BasePayloadInput = {
  event: QuadrantEvent
  department: string
  location: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  arrivalTime: string
  manualResponsibleId: string | null
  manualResponsibleName: string | null
  mode: QuadrantMode
}

/**
 * Construeix la part comuna del payload (camps presents per qualsevol departament).
 */
export function buildBasePayload({
  event,
  department,
  location,
  meetingPoint,
  startDate,
  startTime,
  endDate,
  endTime,
  arrivalTime,
  manualResponsibleId,
  manualResponsibleName,
  mode,
}: BasePayloadInput): Record<string, unknown> {
  const title = event.summary || event.title || ''
  return {
    eventId: event.id,
    code: splitTitle(title).code || '',
    eventName: splitTitle(title).name,
    department,
    location,
    meetingPoint,
    startDate,
    startTime,
    endDate,
    endTime,
    arrivalTime: arrivalTime || null,
    manualResponsibleId,
    manualResponsibleName,
    service: event.service || null,
    numPax: event.numPax ?? null,
    commercial: event.commercial ?? null,
    mode,
  }
}

/**
 * Resol el responsable manual a {id, name} a partir del valor del select i pools de personal.
 * Accepta id o nom; conserva l'id encara que la persona només consti com a conductor.
 */
export function resolveManualResponsible(
  manualResp: string,
  availableResponsables: IdName[],
  extraPools: IdName[] = []
): { id: string | null; name: string | null } {
  if (!manualResp || manualResp === '__auto__') {
    return { id: null, name: null }
  }

  const pools = mergeResponsibleCandidatePools(availableResponsables, extraPools)

  const byId = pools.find((resp) => resp.id === manualResp)
  if (byId) {
    return { id: byId.id, name: byId.name ?? null }
  }

  const key = normResponsibleKey(manualResp)
  const byName = pools.find((resp) => normResponsibleKey(resp.name) === key)
  if (byName) {
    return { id: byName.id, name: byName.name ?? null }
  }

  if (looksLikePersonId(manualResp)) {
    return { id: manualResp, name: null }
  }

  return { id: null, name: manualResp }
}

/**
 * Acumulador de timetables. Retorna l'array i una funció `add` per registrar entrades vàlides.
 */
export function createTimetableCollector(): {
  timetables: TimetableEntry[]
  add: (entry: TimetableEntry) => void
} {
  const timetables: TimetableEntry[] = []
  return {
    timetables,
    add: (entry) => {
      const tt = collectTimetable(entry)
      if (tt) timetables.push(tt)
    },
  }
}

export type ExternalWorker = {
  name: string
  isExternal: boolean
  meetingPoint: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
}

/**
 * Construeix N entrades d'ETT (treballadors externs) a partir d'una configuració base.
 */
export function buildEttEntries(
  workers: number,
  base: Omit<ExternalWorker, 'name' | 'isExternal'>
): ExternalWorker[] {
  if (!workers || workers <= 0) return []
  return Array.from({ length: workers }, () => ({
    name: 'ETT',
    isExternal: true,
    ...base,
  }))
}

/**
 * Concatena `extra` als externalWorkers ja presents al payload.
 */
export function appendExternalWorkers(
  payload: Record<string, unknown>,
  extra: ExternalWorker[]
): void {
  if (!extra.length) return
  const existing = Array.isArray(payload.externalWorkers)
    ? (payload.externalWorkers as ExternalWorkerPayload[])
    : []
  payload.externalWorkers = [...existing, ...extra]
}
