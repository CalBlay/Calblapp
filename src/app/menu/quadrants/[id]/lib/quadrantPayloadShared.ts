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

export type RoleLineReservation = {
  slotId?: string
  role?: string
  personId?: string
  personName?: string
}

export function normalizeRoleLinePersonKey(value?: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Clau de reserva per persona (id preferent; nom si no hi ha id). */
export function roleLinePersonReservationKey(line: {
  personId?: string
  personName?: string
}): string {
  const id = normalizeRoleLinePersonKey(line.personId)
  if (id) return id
  const name = normalizeRoleLinePersonKey(line.personName)
  return name ? `name:${name}` : ''
}

export function roleLineHasAssignedPerson(line: RoleLineReservation): boolean {
  return Boolean(roleLinePersonReservationKey(line))
}

/** Mateixa persona per id o per nom normalitzat (evita duplicats id vs nom). */
export function linesShareSamePerson(
  a: RoleLineReservation,
  b: RoleLineReservation
): boolean {
  const aId = normalizeRoleLinePersonKey(a.personId)
  const bId = normalizeRoleLinePersonKey(b.personId)
  const aName = normalizeRoleLinePersonKey(a.personName)
  const bName = normalizeRoleLinePersonKey(b.personName)
  if (aId && bId && aId === bId) return true
  if (aName && bName && aName === bName) return true
  if (aId && bName && aId === bName) return true
  if (aName && bId && aName === bId) return true
  return false
}

/** Persones assignades a altres línies (excloent la fila actual per slotId, no per personId). */
export function collectReservedPersonKeysFromLines(
  lines: RoleLineReservation[],
  excludeSlotId?: string
): Set<string> {
  const reserved = new Set<string>()
  for (const line of lines) {
    if (excludeSlotId && line.slotId === excludeSlotId) continue
    const id = normalizeRoleLinePersonKey(line.personId)
    const name = normalizeRoleLinePersonKey(line.personName)
    if (id) reserved.add(id)
    if (name) reserved.add(`name:${name}`)
  }
  return reserved
}

/** Reserva persones per fila de rol; el responsable pot ser conductor en UNA línia, no en diverses. */
export function buildReservedForRoleLine(
  allLines: RoleLineReservation[],
  currentLine: RoleLineReservation,
  manualResponsibleId?: string,
  additionalReservedKeys?: Iterable<string>
): Set<string> {
  const reserved = collectReservedPersonKeysFromLines(allLines, currentLine.slotId)
  if (additionalReservedKeys) {
    for (const key of additionalReservedKeys) {
      const normalized = normalizeRoleLinePersonKey(key)
      if (normalized) reserved.add(normalized)
      else {
        const nameKey = roleLinePersonReservationKey({ personName: key })
        if (nameKey) reserved.add(nameKey)
      }
    }
  }
  const manualId = normalizeRoleLinePersonKey(manualResponsibleId)
  if (
    manualId &&
    manualId !== '__auto__' &&
    manualId !== '__manual_pick__' &&
    (currentLine.role === 'conductor' || currentLine.role === 'responsable')
  ) {
    const manualPerson: RoleLineReservation = { personId: manualResponsibleId, personName: '' }
    const anotherLineHasManual = allLines.some(
      (line) =>
        line.slotId !== currentLine.slotId &&
        roleLineHasAssignedPerson(line) &&
        linesShareSamePerson(line, manualPerson)
    )
    if (!anotherLineHasManual) {
      reserved.delete(manualId)
      reserved.delete(`name:${manualId}`)
    }
  }
  return reserved
}

export function dedupeRoleLinePersonAssignments<T extends RoleLineReservation>(
  lines: T[],
  preferredSlotId?: string
): T[] {
  if (preferredSlotId) {
    const preferredLine = lines.find((line) => line.slotId === preferredSlotId)
    if (!preferredLine || !roleLineHasAssignedPerson(preferredLine)) {
      return dedupeRoleLinePersonAssignments(lines)
    }
    return lines.map((line) => {
      if (line.slotId === preferredSlotId) return line
      if (!roleLineHasAssignedPerson(line)) return line
      if (linesShareSamePerson(line, preferredLine)) {
        return { ...line, personId: '', personName: '' }
      }
      return line
    })
  }

  const kept: T[] = []
  return lines.map((line) => {
    if (!roleLineHasAssignedPerson(line)) {
      kept.push(line)
      return line
    }
    const duplicate = kept.some(
      (other) => roleLineHasAssignedPerson(other) && linesShareSamePerson(line, other)
    )
    kept.push(line)
    if (duplicate) return { ...line, personId: '', personName: '' }
    return line
  })
}

export function findDuplicateRoleLinePersonKeys(lines: RoleLineReservation[]): string[] {
  const duplicates = new Set<string>()
  for (let i = 0; i < lines.length; i += 1) {
    if (!roleLineHasAssignedPerson(lines[i])) continue
    for (let j = i + 1; j < lines.length; j += 1) {
      if (!roleLineHasAssignedPerson(lines[j])) continue
      if (linesShareSamePerson(lines[i], lines[j])) {
        const key =
          roleLinePersonReservationKey(lines[i]) || roleLinePersonReservationKey(lines[j])
        if (key) duplicates.add(key)
      }
    }
  }
  return [...duplicates]
}

export function isPersonReservedForRoleLine(
  person: { id?: string; name?: string },
  reserved: Set<string>
): boolean {
  const id = normalizeRoleLinePersonKey(person.id)
  const name = normalizeRoleLinePersonKey(person.name)
  if (id && reserved.has(id)) return true
  if (name && reserved.has(`name:${name}`)) return true
  if (name && reserved.has(name)) return true
  if (id && reserved.has(`name:${id}`)) return true
  return false
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
