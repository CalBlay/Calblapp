import { addDays, format, parseISO } from 'date-fns'
import { validateNoLocalQuadrantPersonDuplicates } from '@/lib/quadrantLocalAvailability'
import { mapDraftToEditorModel } from '@/lib/quadrantsDraftAdapters'
import {
  normalizeDepartmentKey,
  type EditorDraftInput,
  type EditorGroup,
  type EditorRole,
  type EditorRow,
} from '@/lib/quadrantsDraftEditor'

export type ManualAssignDepartment = 'serveis' | 'logistica' | 'cuina' | string

export type ManualAssignDeptConfig = {
  department: string
  isServeis: boolean
  isLogistica: boolean
  isCuina: boolean
  showVestiment: boolean
  showVehicleFields: boolean
  usesGroups: boolean
  showArrivalTime: boolean
  /** Etiqueta UI per als grups de vehicle/equip */
  groupLabel: 'cotxe' | 'grup'
}

export const getManualAssignDeptConfig = (
  department?: string,
  phaseType?: string
): ManualAssignDeptConfig => {
  const departmentKey = normalizeDepartmentKey(department)
  const isServeis = departmentKey === 'serveis'
  const isLogistica = departmentKey === 'logistica'
  const isCuina = departmentKey === 'cuina'
  const phaseKey = String(phaseType || 'event')
    .toLowerCase()
    .trim()
  const serveisUsesGroups = isServeis && phaseKey === 'event'
  const usesGroups = serveisUsesGroups || isCuina || isLogistica
  return {
    department: departmentKey,
    isServeis,
    isLogistica,
    isCuina,
    showVestiment: isServeis,
    showVehicleFields: isLogistica || isCuina,
    usesGroups,
    showArrivalTime: isLogistica || isCuina,
    groupLabel: isServeis ? 'grup' : 'cotxe',
  }
}

const DEFAULT_GROUP_ID = 'group-1'

export function normalizeAssignPersonKey(value?: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

type AssignablePerson = { id?: string; name?: string }
type AssignableVehicle = { plate?: string }

export function getAssignedPeopleExcludingRow(
  rows: EditorRow[],
  excludeIndex: number,
  roster: AssignablePerson[] = []
): { ids: Set<string>; names: Set<string> } {
  const ids = new Set<string>()
  const names = new Set<string>()

  rows.forEach((row, index) => {
    if (index === excludeIndex) return
    const rowId = normalizeAssignPersonKey(row.id)
    const rowName = normalizeAssignPersonKey(row.name)
    if (rowId) ids.add(rowId)
    if (rowName) names.add(rowName)

    const rosterMatch =
      rowId
        ? roster.find((person) => normalizeAssignPersonKey(person.id) === rowId)
        : rowName
          ? roster.find((person) => normalizeAssignPersonKey(person.name) === rowName)
          : undefined

    if (rosterMatch) {
      const matchId = normalizeAssignPersonKey(rosterMatch.id)
      const matchName = normalizeAssignPersonKey(rosterMatch.name)
      if (matchId) ids.add(matchId)
      if (matchName) names.add(matchName)
    }
  })

  return { ids, names }
}

export function isPersonAssignedElsewhere(
  person: AssignablePerson,
  assigned: { ids: Set<string>; names: Set<string> }
): boolean {
  const id = normalizeAssignPersonKey(person.id)
  const name = normalizeAssignPersonKey(person.name)
  if (id && assigned.ids.has(id)) return true
  if (name && assigned.names.has(name)) return true
  return false
}

/** Pas 1 (local): valida que cap persona no es repeteixi entre files del mateix quadrant. */
export function validateEditorRowsNoDuplicatePeople(rows: EditorRow[]): string | null {
  const lines = rows
    .filter((row) => !row.isExternal && (row.id || row.name))
    .map((row, index) => ({
      slotId: `row-${index}`,
      personId: row.id,
      personName: row.name,
    }))
  return validateNoLocalQuadrantPersonDuplicates(lines)
}

export function filterPersonnelPool<T extends AssignablePerson>(
  pool: T[],
  assigned: { ids: Set<string>; names: Set<string> }
): T[] {
  return pool.filter((person) => !isPersonAssignedElsewhere(person, assigned))
}

export function normalizeAssignVehiclePlate(value?: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

export function getAssignedVehiclesExcludingRow(
  rows: EditorRow[],
  excludeIndex: number
): Set<string> {
  const plates = new Set<string>()

  rows.forEach((row, index) => {
    if (index === excludeIndex) return
    const plate = normalizeAssignVehiclePlate(row.plate)
    if (plate) plates.add(plate)
  })

  return plates
}

export function filterVehiclePool<T extends AssignableVehicle>(
  pool: T[],
  assignedPlates: Set<string>
): T[] {
  return pool.filter((vehicle) => {
    const plate = normalizeAssignVehiclePlate(vehicle.plate)
    return !plate || !assignedPlates.has(plate)
  })
}

export type ManualAssignState = {
  rows: EditorRow[]
  groups: EditorGroup[]
  globalStartDate: string
  globalStartTime: string
  globalEndTime: string
  globalMeetingPoint: string
  vestimentModel: string
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const base = parseISO(`${isoDate}T12:00:00`)
  if (Number.isNaN(base.getTime())) return isoDate
  return format(addDays(base, days), 'yyyy-MM-dd')
}

export function compareTimeValues(a: string, b: string): number {
  const toMinutes = (value: string) => {
    const [hours = 0, minutes = 0] = String(value || '00:00')
      .split(':')
      .map((part) => Number(part) || 0)
    return hours * 60 + minutes
  }
  return toMinutes(a) - toMinutes(b)
}

/** Si la hora fi és abans o igual que la d'inici, el torn creua mitjanit (+1 dia). */
export function inferEndDateFromTimes(
  startDate: string,
  startTime: string,
  endTime: string
): string {
  const date = String(startDate || '').trim()
  if (!date) return ''
  const start = String(startTime || '').trim()
  const end = String(endTime || '').trim()
  if (!start || !end) return date
  if (compareTimeValues(end, start) <= 0) {
    return addDaysToIsoDate(date, 1)
  }
  return date
}

export function normalizeRowSchedule(
  row: EditorRow,
  fallbackStartDate = ''
): EditorRow {
  const startDate = String(row.startDate || fallbackStartDate || '').trim()
  const startTime = String(row.startTime || '').trim()
  const endTime = String(row.endTime || '').trim()
  const inferredEndDate = inferEndDateFromTimes(startDate, startTime, endTime)
  return {
    ...row,
    startDate,
    endDate: String(row.endDate || inferredEndDate || startDate).trim(),
  }
}

export function patchRowSchedule(
  row: EditorRow,
  patch: Partial<Pick<EditorRow, 'startDate' | 'startTime' | 'endTime' | 'endDate'>>
): Partial<EditorRow> {
  if (Object.keys(patch).length === 1 && 'endDate' in patch) {
    return patch
  }

  const merged = { ...row, ...patch }
  const startDate = String(merged.startDate || '').trim()
  if (!startDate) return patch

  const shouldInfer =
    'startDate' in patch || 'startTime' in patch || 'endTime' in patch
  if (!shouldInfer) return patch

  const startTime = String(merged.startTime || '').trim()
  const endTime = String(merged.endTime || '').trim()
  return {
    ...patch,
    endDate: inferEndDateFromTimes(startDate, startTime, endTime) || startDate,
  }
}

export function initManualAssignState(draft: EditorDraftInput): ManualAssignState {
  const department = normalizeDepartmentKey(draft.department)
  const phaseType = String(
    (draft as EditorDraftInput & { phaseType?: string }).phaseType || 'event'
  )
  const model = mapDraftToEditorModel({ ...draft, department })
  const globalStartDate = draft.startDate || model.rows[0]?.startDate || ''
  const globalStartTime = draft.startTime || model.rows[0]?.startTime || ''
  const globalEndTime = draft.endTime || model.rows[0]?.endTime || ''
  const globalMeetingPoint =
    model.defaultMeetingPoint ||
    String(draft.meetingPoint || '').trim() ||
    (typeof draft.location === 'string' ? draft.location : '')

  let rows = model.rows
    .filter((row) => !row.isExternal || row.name !== 'ETT')
    .map((row) => normalizeRowSchedule(row, globalStartDate))
  let groups = model.groups

  const config = getManualAssignDeptConfig(department, phaseType)
  if (config.usesGroups && groups.length === 0) {
    groups = [buildDefaultGroup(draft, globalMeetingPoint, globalStartTime, globalEndTime)]
  }

  if (rows.length === 0) {
    rows = [
      createManualAssignRow({
        draft,
        role: 'responsable',
        groupId: config.usesGroups ? DEFAULT_GROUP_ID : undefined,
        startTime: globalStartTime,
        endTime: globalEndTime,
        meetingPoint: globalMeetingPoint,
        prefilledName:
          typeof draft.responsableName === 'string' ? draft.responsableName : '',
        prefilledId: draft.responsableId || draft.responsable?.id || '',
      }),
    ]
  } else if (config.usesGroups) {
    rows = rows.map((row) => ({
      ...row,
      groupId: row.groupId || DEFAULT_GROUP_ID,
    }))
  }

  return {
    rows,
    groups,
    globalStartDate,
    globalStartTime,
    globalEndTime,
    globalMeetingPoint,
    vestimentModel: String(draft.vestimentModel || '').trim(),
  }
}

export function buildDefaultGroup(
  draft: EditorDraftInput,
  meetingPoint: string,
  startTime: string,
  endTime: string
): EditorGroup {
  const responsableName =
    typeof draft.responsableName === 'string' ? draft.responsableName.trim() : ''
  return {
    id: DEFAULT_GROUP_ID,
    serviceDate: draft.startDate,
    meetingPoint,
    startTime,
    endTime,
    workers: responsableName ? 1 : 0,
    drivers: 0,
    wantsResponsible: true,
    responsibleName: responsableName || null,
    responsibleId: draft.responsableId || null,
  }
}

export function createManualAssignRow({
  draft,
  role,
  groupId,
  startDate,
  startTime,
  endTime,
  meetingPoint,
  prefilledName = '',
  prefilledId = '',
}: {
  draft: EditorDraftInput
  role: EditorRole
  groupId?: string
  startDate?: string
  startTime: string
  endTime: string
  meetingPoint: string
  prefilledName?: string
  prefilledId?: string
}): EditorRow {
  const resolvedStartDate = startDate || draft.startDate
  return normalizeRowSchedule(
    {
      id: prefilledId,
      name: prefilledName,
      role,
      isJamonero: false,
      isDriver: false,
      groupId,
      startDate: resolvedStartDate,
      startTime,
      endDate: draft.endDate || resolvedStartDate,
      endTime,
      meetingPoint,
      arrivalTime: draft.arrivalTime || '',
      plate: '',
      vehicleType: '',
    },
    resolvedStartDate
  )
}

export function createManualAssignGroup({
  draft,
  meetingPoint,
  startTime,
  endTime,
  source,
}: {
  draft: EditorDraftInput
  meetingPoint: string
  startTime: string
  endTime: string
  source?: EditorGroup | null
}): EditorGroup {
  return {
    id: `group-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    serviceDate: source?.serviceDate || draft.startDate,
    dateLabel: source?.dateLabel || null,
    meetingPoint: source?.meetingPoint || meetingPoint,
    startTime: source?.startTime || startTime,
    endTime: source?.endTime || endTime,
    arrivalTime: source?.arrivalTime || draft.arrivalTime || null,
    workers: 0,
    drivers: 0,
    wantsResponsible: true,
    responsibleId: null,
    responsibleName: null,
    driverId: null,
    driverName: null,
  }
}

export function applyGroupScheduleToRows(
  rows: EditorRow[],
  groupId: string,
  group: EditorGroup,
  defaultGroupId?: string
): EditorRow[] {
  const resolvedGroupId = groupId || defaultGroupId || ''
  const serviceDate = String(group.serviceDate || '').trim()
  const startTime = String(group.startTime || '').trim()
  const endTime = String(group.endTime || '').trim()
  const meetingPoint = String(group.meetingPoint || '').trim()

  return rows.map((row) => {
    if ((row.groupId || defaultGroupId) !== resolvedGroupId) return row
    return normalizeRowSchedule(
      {
        ...row,
        startDate: serviceDate || row.startDate,
        startTime: startTime || row.startTime,
        endTime: endTime || row.endTime,
        meetingPoint: meetingPoint || row.meetingPoint,
      },
      serviceDate || row.startDate
    )
  })
}

const ROLE_SORT_ORDER: Record<string, number> = {
  responsable: 0,
  conductor: 1,
  treballador: 2,
}

export function sortRowsByRole<T extends { role: string; isJamonero?: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ao = ROLE_SORT_ORDER[a.role] ?? 9
    const bo = ROLE_SORT_ORDER[b.role] ?? 9
    if (ao !== bo) return ao - bo
    if (a.role === 'treballador' && a.isJamonero !== b.isJamonero) {
      return a.isJamonero ? -1 : 1
    }
    return 0
  })
}

export function applyGlobalTimesToRows(
  rows: EditorRow[],
  groups: EditorGroup[],
  config: ManualAssignDeptConfig,
  globalStartDate: string,
  globalStartTime: string,
  globalEndTime: string,
  globalMeetingPoint: string,
  options?: { applyMeetingPoint?: boolean; applyStartDate?: boolean }
): { rows: EditorRow[]; groups: EditorGroup[] } {
  const applyMeetingPoint = options?.applyMeetingPoint === true
  const applyStartDate = options?.applyStartDate === true
  const nextRows = rows.map((row) => {
    const startDate =
      applyStartDate && globalStartDate
        ? globalStartDate
        : row.startDate || globalStartDate
    const startTime = globalStartTime || row.startTime
    const endTime = globalEndTime || row.endTime
    return normalizeRowSchedule(
      {
        ...row,
        startDate,
        startTime,
        endTime,
        endDate: applyStartDate
          ? inferEndDateFromTimes(startDate, startTime, endTime)
          : row.endDate,
        meetingPoint: applyMeetingPoint
          ? globalMeetingPoint || row.meetingPoint
          : row.meetingPoint || globalMeetingPoint,
      },
      globalStartDate
    )
  })

  if (!config.usesGroups) {
    return { rows: nextRows, groups }
  }

  const nextGroups = (groups.length > 0 ? groups : [buildDefaultGroup(
    { startDate: globalStartDate || nextRows[0]?.startDate || '' } as EditorDraftInput,
    globalMeetingPoint,
    globalStartTime,
    globalEndTime
  )]).map((group) => ({
    ...group,
    serviceDate: applyStartDate && globalStartDate ? globalStartDate : group.serviceDate,
    startTime: globalStartTime || group.startTime,
    endTime: globalEndTime || group.endTime,
    meetingPoint: globalMeetingPoint || group.meetingPoint,
  }))

  return { rows: nextRows, groups: nextGroups }
}

export type RoleSelectValue = EditorRole | 'jamonero'

export function roleSelectValueFromRow(row: EditorRow): RoleSelectValue {
  if (row.role === 'treballador' && row.isJamonero) return 'jamonero'
  return row.role
}

export function patchRowRole(row: EditorRow, value: RoleSelectValue): EditorRow {
  if (value === 'jamonero') {
    return {
      ...row,
      role: 'treballador',
      isJamonero: true,
      isExternal: false,
    }
  }
  return {
    ...row,
    role: value,
    isJamonero: false,
    isExternal: false,
    ...(value !== 'conductor' ? { plate: '', vehicleType: '' } : {}),
  }
}
