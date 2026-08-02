import type { EditorDraftInput, EditorGroup, EditorRow } from '@/lib/quadrantsDraftEditor'
import { mapDraftToEditorModel } from '@/lib/quadrantsDraftAdapters'
import {
  servicePhaseOptions,
  type ServicePhaseKey,
  type ServicePhaseSetting,
  type ServeiGroup,
  type ServeiGroupRoleLine,
  type ServeiRoleKey,
} from '../phaseConfig'
import { createEmptyRoleLine, syncGroupFromRoleLines, sortRoleLinesConductorFirst } from './serviceGroupRoleLines'
import {
  resolveRoleLinesPersonIds,
  type PersonnelPoolRef,
} from './resolveRoleLinePersonIds'

type ServeisGroupDef = EditorGroup & {
  roleLines?: Array<{
    slotId?: string
    role?: ServeiRoleKey
    personId?: string
    personName?: string
    meetingPoint?: string
    serviceDate?: string
    startTime?: string
    endTime?: string
  }>
  manualWorkers?: Array<{
    id?: string
    name?: string
    isJamonero?: boolean
    meetingPoint?: string
    serviceDate?: string
    startTime?: string
    endTime?: string
  }>
}

const normName = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const resolveDraftPersonName = (draft: EditorDraftInput, id: string) => {
  if (!id) return ''
  if (draft.responsable?.id === id) return String(draft.responsable?.name || '')
  const driver = (draft.conductors || []).find((c) => c.id === id)
  if (driver?.name) return String(driver.name)
  const worker = (draft.treballadors || []).find((t) => t.id === id)
  if (worker?.name) return String(worker.name)
  return ''
}

const resolveConductorNameFromDraft = (draft: EditorDraftInput, groupDef: ServeisGroupDef) => {
  const driverId = String(groupDef.driverId || '').trim()
  const fromGroup = String(groupDef.driverName || '').trim()
  if (fromGroup) return fromGroup
  if (driverId) return resolveDraftPersonName(draft, driverId)
  const byName = (draft.conductors || []).find((c) => normName(c.name) && !normName(c.name).includes('extra'))
  return String(byName?.name || '').trim()
}

/** Preferim `groups.manualWorkers` + `driverId` (desament role-lines) abans de reconstruir per files. */
function roleLinesFromSavedServeisGroup(
  groupDef: ServeisGroupDef,
  draft: EditorDraftInput,
  defaultMeetingPoint: string
): ServeiGroupRoleLine[] | null {
  const savedRoleLines = Array.isArray(groupDef.roleLines)
    ? groupDef.roleLines
        .map((line) => ({
          slotId: String(line?.slotId || makeSlotId()),
          role: (line?.role || 'treballador') as ServeiRoleKey,
          personId: String(line?.personId || '').trim(),
          personName: String(line?.personName || '').trim(),
          serviceDate: String(line?.serviceDate || groupDef.serviceDate || draft.startDate || ''),
          meetingPoint: String(line?.meetingPoint || groupDef.meetingPoint || defaultMeetingPoint),
          startTime: String(line?.startTime || groupDef.startTime || draft.startTime || ''),
          endTime: String(line?.endTime || groupDef.endTime || draft.endTime || ''),
        }))
        .filter((line) => {
          const hasPerson = Boolean(line.personId || line.personName)
          const isPlaceholderConductor =
            line.role === 'conductor' && !line.personId && !line.personName
          return hasPerson || isPlaceholderConductor
        })
    : []
  if (savedRoleLines.length > 0) {
    return sortRoleLinesConductorFirst(savedRoleLines)
  }

  const manualWorkers = Array.isArray(groupDef.manualWorkers) ? groupDef.manualWorkers : []
  const driverId = String(groupDef.driverId || '').trim()
  const driverName = resolveConductorNameFromDraft(draft, groupDef)
  const hasDriver = Boolean(driverId || driverName)
  const hasStaff = manualWorkers.some(
    (w) => String(w.id || '').trim() || String(w.name || '').trim()
  )
  const respId = String(groupDef.responsibleId || '').trim()
  const respName = String(groupDef.responsibleName || '').trim()
  const wantsResponsible =
    groupDef.wantsResponsible === true ||
    Boolean(respId || respName)

  if (!hasDriver && !hasStaff && !(wantsResponsible && (respId || respName))) {
    return null
  }

  const serviceDate = String(groupDef.serviceDate || draft.startDate || '')
  const meetingPoint = String(groupDef.meetingPoint || defaultMeetingPoint)
  const startTime = String(groupDef.startTime || draft.startTime || '')
  const endTime = String(groupDef.endTime || draft.endTime || '')
  const lines: ServeiGroupRoleLine[] = []

  if (hasDriver) {
    lines.push({
      slotId: makeSlotId(),
      role: 'conductor',
      personId: driverId,
      personName: driverName,
      serviceDate,
      meetingPoint,
      startTime,
      endTime,
    })
  }

  if (wantsResponsible && (respId || respName)) {
    lines.push({
      slotId: makeSlotId(),
      role: 'responsable',
      personId: respId,
      personName: respName || resolveDraftPersonName(draft, respId),
      serviceDate,
      meetingPoint,
      startTime,
      endTime,
    })
  }

  for (const worker of manualWorkers) {
    const name = String(worker.name || '').trim()
    const id = String(worker.id || '').trim()
    if (!name && !id) continue
    lines.push({
      slotId: makeSlotId(),
      role: worker.isJamonero ? 'jamonero' : 'treballador',
      personId: id,
      personName: name,
      serviceDate: String(worker.serviceDate || serviceDate),
      meetingPoint: String(worker.meetingPoint || meetingPoint),
      startTime: String(worker.startTime || startTime),
      endTime: String(worker.endTime || endTime),
    })
  }

  if (!lines.length) return null
  return sortRoleLinesConductorFirst(lines)
}

const workerBelongsToGroup = (
  worker: { groupId?: string | null },
  groupDef: ServeisGroupDef,
  groupId: string,
  groupIndex: number
) => {
  const workerGroupId = String(worker?.groupId || '').trim()
  if (workerGroupId) return workerGroupId === groupId
  return groupIndex === 0
}

/** Quan `groups.manualWorkers` no ve a Firestore, reconstruïm des de `conductors` / `treballadors` / responsable. */
function roleLinesFromDraftPersonnel(
  draft: EditorDraftInput,
  groupDef: ServeisGroupDef,
  defaultMeetingPoint: string,
  groupIndex = 0
): ServeiGroupRoleLine[] | null {
  const groupId = String(groupDef.id || `group-${groupIndex + 1}`)
  const serviceDate = String(groupDef.serviceDate || draft.startDate || '')
  const meetingPoint = String(groupDef.meetingPoint || defaultMeetingPoint)
  const startTime = String(groupDef.startTime || draft.startTime || '')
  const endTime = String(groupDef.endTime || draft.endTime || '')
  const lines: ServeiGroupRoleLine[] = []
  const seenNames = new Set<string>()

  const pushLine = (role: ServeiRoleKey, id: string, name: string, isJamonero?: boolean) => {
    const trimmed = String(name || '').trim()
    const key = normName(trimmed)
    if (!key || key === 'extra' || seenNames.has(key)) return
    seenNames.add(key)
    lines.push({
      slotId: makeSlotId(),
      role: isJamonero && role === 'treballador' ? 'jamonero' : role,
      personId: String(id || '').trim(),
      personName: trimmed,
      serviceDate,
      meetingPoint,
      startTime,
      endTime,
    })
  }

  const wantsResponsible =
    groupDef.wantsResponsible === true ||
    Boolean(String(groupDef.responsibleId || '').trim() || String(groupDef.responsibleName || '').trim())
  const respId = String(groupDef.responsibleId || '').trim()
  const respName = String(groupDef.responsibleName || '').trim()

  if (wantsResponsible && (respId || respName)) {
    pushLine('responsable', respId, respName || resolveDraftPersonName(draft, respId))
  }

  const driverId = String(groupDef.driverId || '').trim()
  const driverName = resolveConductorNameFromDraft(draft, groupDef)
  if (driverId || driverName) {
    pushLine('conductor', driverId, driverName)
  } else if (groupIndex === 0) {
    for (const conductor of draft.conductors || []) {
      pushLine(
        'conductor',
        String(conductor?.id || ''),
        String(conductor?.name || ''),
        conductor?.isJamonero === true
      )
    }
  }

  for (const worker of draft.treballadors || []) {
    if (!workerBelongsToGroup(worker, groupDef, groupId, groupIndex)) continue
    pushLine(
      'treballador',
      String(worker?.id || ''),
      String(worker?.name || ''),
      worker?.isJamonero === true
    )
  }

  if (!lines.length) return null
  return sortRoleLinesConductorFirst(lines)
}

/** Combina candidates per nom/id; prioritat d’ordre (manualWorkers → files → arrays draft). */
function mergeRoleLineCandidates(
  candidates: Array<ServeiGroupRoleLine[] | null | undefined>,
  fallback: ServeiGroupRoleLine[]
): ServeiGroupRoleLine[] {
  const merged: ServeiGroupRoleLine[] = []
  const seenNames = new Set<string>()
  const seenIds = new Set<string>()

  for (const candidate of candidates) {
    if (!candidate?.length) continue
    for (const line of candidate) {
      const nameKey = normName(line.personName)
      const id = String(line.personId || '').trim()
      if (!nameKey && !id) continue
      if (id && seenIds.has(id)) continue
      if (nameKey && seenNames.has(nameKey)) continue
      if (id) seenIds.add(id)
      if (nameKey) seenNames.add(nameKey)
      merged.push(line)
    }
  }

  if (!merged.length) return fallback
  return sortRoleLinesConductorFirst(merged)
}

const makeGroupId = () => `group-${Date.now()}-${Math.random().toString(16).slice(2)}`
const makeSlotId = () => `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`

const createServicePhaseVisibility = () =>
  servicePhaseOptions.reduce(
    (acc, phase) => {
      acc[phase.key] = phase.key === 'event'
      return acc
    },
    {} as Record<ServicePhaseKey, boolean>
  )

const createServicePhaseSettings = () =>
  servicePhaseOptions.reduce(
    (acc, phase) => {
      acc[phase.key] = {
        selected: phase.key === 'event',
        needsResponsible: phase.key === 'event',
      }
      return acc
    },
    {} as Record<ServicePhaseKey, ServicePhaseSetting>
  )

function resolvePhaseKey(draft: EditorDraftInput): ServicePhaseKey {
  const phase = String(
    (draft as EditorDraftInput & { phaseType?: string }).phaseType || 'event'
  )
    .toLowerCase()
    .trim()
  return phase === 'muntatge' ? 'muntatge' : 'event'
}

function editorRowToRoleLine(row: EditorRow): ServeiGroupRoleLine {
  let role: ServeiRoleKey = 'treballador'
  if (row.role === 'responsable') role = 'responsable'
  else if (row.role === 'conductor') role = 'conductor'
  else if (row.isJamonero) role = 'jamonero'

  return {
    slotId: makeSlotId(),
    role,
    personId: String(row.id || '').trim(),
    personName: String(row.name || '').trim(),
    serviceDate: row.startDate,
    meetingPoint: row.meetingPoint,
    startTime: row.startTime,
    endTime: row.endTime,
  }
}

function createDefaultGroup(
  draft: EditorDraftInput,
  defaultMeetingPoint: string
): NonNullable<EditorDraftInput['groups']>[number] {
  return {
    id: 'group-1',
    serviceDate: draft.startDate,
    meetingPoint: defaultMeetingPoint || String(draft.meetingPoint || '').trim(),
    startTime: draft.startTime || '',
    endTime: draft.endTime || '',
  }
}

function createEmptyPhaseGroup(
  phaseKey: ServicePhaseKey,
  draft: EditorDraftInput,
  defaultMeetingPoint: string
): ServeiGroup {
  const base: ServeiGroup = {
    id: makeGroupId(),
    phaseKey,
    serviceDate: draft.startDate || '',
    dateLabel: '',
    meetingPoint: defaultMeetingPoint || String(draft.meetingPoint || '').trim(),
    startTime: draft.startTime || '',
    endTime: draft.endTime || '',
    workers: 0,
    jamoneros: 0,
    wantsResponsible: phaseKey === 'event',
    responsibleId: '',
    needsDriver: false,
    driverId: '',
  }
  return syncGroupFromRoleLines(base, [createEmptyRoleLine(base, 'conductor')])
}

export type HydratedServiceDraftState = {
  groups: ServeiGroup[]
  settings: Record<ServicePhaseKey, ServicePhaseSetting>
  visibility: Record<ServicePhaseKey, boolean>
}

export function hydrateServiceGroupsFromDraft(
  draft: EditorDraftInput,
  personnelPools: PersonnelPoolRef[] = []
): HydratedServiceDraftState {
  const model = mapDraftToEditorModel(draft)
  const phaseKey = resolvePhaseKey(draft)
  const defaultMeetingPoint =
    model.defaultMeetingPoint || String(draft.meetingPoint || '').trim()

  const rows = model.rows.filter((row) => !row.isExternal || row.name !== 'ETT')
  let groupDefs = model.groups

  if (groupDefs.length === 0) {
    groupDefs = [createDefaultGroup(draft, defaultMeetingPoint)]
  }

  const normalizedRows = rows.map((row) => ({
    ...row,
    groupId: row.groupId || groupDefs[0]?.id || 'group-1',
  }))

  const draftGroups: ServeiGroup[] = groupDefs.map((groupDef, idx) => {
    const groupId = String(groupDef.id || `group-${idx + 1}`)
    const groupRows = normalizedRows.filter(
      (row) => String(row.groupId || groupDefs[0]?.id || 'group-1') === groupId
    )

    const fromSavedGroup = roleLinesFromSavedServeisGroup(
      groupDef as ServeisGroupDef,
      draft,
      defaultMeetingPoint
    )
    const fromRows =
      groupRows.length > 0
        ? sortRoleLinesConductorFirst(groupRows.map(editorRowToRoleLine))
        : null
    const fromDraftPersonnel = roleLinesFromDraftPersonnel(
      draft,
      groupDef as ServeisGroupDef,
      defaultMeetingPoint,
      idx
    )

    const emptyFallback = [
      createEmptyRoleLine(
        {
          id: groupId,
          phaseKey,
          serviceDate: String(groupDef.serviceDate || draft.startDate || ''),
          dateLabel: String(groupDef.dateLabel || ''),
          meetingPoint: String(groupDef.meetingPoint || defaultMeetingPoint),
          startTime: String(groupDef.startTime || draft.startTime || ''),
          endTime: String(groupDef.endTime || draft.endTime || ''),
          workers: 0,
          jamoneros: 0,
          wantsResponsible: groupDef.wantsResponsible === true,
          responsibleId: '',
          needsDriver: Boolean(groupDef.needsDriver),
          driverId: String(groupDef.driverId || ''),
        },
        'conductor'
      ),
    ]

    const roleLinesRaw = mergeRoleLineCandidates(
      [fromSavedGroup, fromRows, fromDraftPersonnel],
      emptyFallback
    )

    const roleLines = resolveRoleLinesPersonIds(roleLinesRaw, personnelPools)

    const base: ServeiGroup = {
      id: groupId.startsWith('group-') && idx > 0 ? makeGroupId() : groupId,
      phaseKey,
      serviceDate: String(groupDef.serviceDate || draft.startDate || ''),
      dateLabel: String(groupDef.dateLabel || ''),
      meetingPoint: String(groupDef.meetingPoint || defaultMeetingPoint),
      startTime: String(groupDef.startTime || draft.startTime || ''),
      endTime: String(groupDef.endTime || draft.endTime || ''),
      workers: groupRows.length,
      jamoneros: groupRows.filter((row) => row.isJamonero).length,
      wantsResponsible: groupDef.wantsResponsible === true,
      responsibleId: String(groupDef.responsibleId || ''),
      needsDriver: Boolean(groupDef.needsDriver),
      driverId: String(groupDef.driverId || ''),
    }

    return syncGroupFromRoleLines(base, roleLines)
  })

  const settings = createServicePhaseSettings()
  const visibility = createServicePhaseVisibility()
  servicePhaseOptions.forEach((phase) => {
    settings[phase.key].selected = phase.key === phaseKey
    visibility[phase.key] = phase.key === phaseKey
  })

  const otherPhase = servicePhaseOptions.find((phase) => phase.key !== phaseKey)
  const groups =
    otherPhase != null
      ? [...draftGroups, createEmptyPhaseGroup(otherPhase.key, draft, defaultMeetingPoint)]
      : draftGroups

  return { groups, settings, visibility }
}
