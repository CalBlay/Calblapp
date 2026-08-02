import {
  logisticPhaseOptions,
  type LogisticPhaseForm,
  type LogisticPhaseKey,
  type ServeiGroupRoleLine,
  type VehicleAssignment,
} from '../phaseConfig'
import { dedupeRoleLinePersonAssignments } from './quadrantPayloadShared'

export function collectAllLogisticaRoleLines(
  phaseForms: Record<LogisticPhaseKey, LogisticPhaseForm>,
  phaseVehicleAssignments: Record<LogisticPhaseKey, VehicleAssignment[]>
): ServeiGroupRoleLine[] {
  return logisticPhaseOptions.flatMap((phase) =>
    ensureLogisticRoleLines(phaseForms[phase.key], phaseVehicleAssignments[phase.key] || [])
  )
}

const makeSlotId = () => `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`

const formDefaults = (form: LogisticPhaseForm) => ({
  serviceDate: form.startDate,
  meetingPoint: form.meetingPoint,
  startTime: form.startTime,
  endTime: form.endTime,
  arrivalTime: form.arrivalTime || '',
})

export type LogisticRoleKey = 'conductor' | 'treballador'

export function createEmptyLogisticRoleLine(
  form: LogisticPhaseForm,
  role: LogisticRoleKey = 'treballador'
): ServeiGroupRoleLine {
  return {
    slotId: makeSlotId(),
    role,
    personId: '',
    personName: '',
    ...formDefaults(form),
  }
}

/** @deprecated use createEmptyLogisticRoleLine */
export const createEmptyLogisticWorkerLine = createEmptyLogisticRoleLine

function workerLinesFromLegacyForm(form: LogisticPhaseForm): ServeiGroupRoleLine[] {
  const workerIds = Array.isArray(form.workerIds) ? form.workerIds : []
  const details = form.workerDetails || {}
  return workerIds.map((personId) => {
    const id = String(personId || '').trim()
    const detail = id ? details[id] : undefined
    return {
      slotId: makeSlotId(),
      role: 'treballador' as const,
      personId: id,
      personName: detail?.name,
      serviceDate: detail?.serviceDate || form.startDate,
      meetingPoint: detail?.meetingPoint || form.meetingPoint,
      startTime: detail?.startTime || form.startTime,
      endTime: detail?.endTime || form.endTime,
      arrivalTime: detail?.arrivalTime || form.arrivalTime || '',
    }
  })
}

function conductorLinesFromAssignments(
  form: LogisticPhaseForm,
  assignments: VehicleAssignment[]
): ServeiGroupRoleLine[] {
  return assignments.map((assignment, idx) => ({
    slotId: assignment.slotId || `vehicle-slot-${idx}`,
    role: 'conductor' as const,
    personId: String(assignment.conductorId || '').trim(),
    personName: '',
    ...formDefaults(form),
    arrivalTime: assignment.arrivalTime || form.arrivalTime || '',
  }))
}

export function ensureLogisticRoleLines(
  form: LogisticPhaseForm,
  assignments: VehicleAssignment[] = []
): ServeiGroupRoleLine[] {
  const mergeConductorAssignment = (line: ServeiGroupRoleLine): ServeiGroupRoleLine => {
    if (line.role !== 'conductor') return line
    const assignment = assignments.find((entry) => entry.slotId === line.slotId)
    const personId = String(line.personId || assignment?.conductorId || '').trim()
    if (!personId || personId === line.personId) return line
    return { ...line, personId }
  }

  if (Array.isArray(form.roleLines) && form.roleLines.length > 0) {
    return form.roleLines
      .filter((line) => line.role === 'conductor' || line.role === 'treballador')
      .map(mergeConductorAssignment)
  }

  const lines: ServeiGroupRoleLine[] = []

  const assignList =
    assignments.length > 0
      ? assignments
      : Array.from({ length: Math.max(0, Number(form.drivers) || 0) }, (_, idx) => ({
          slotId: `legacy-vehicle-${idx}`,
          vehicleType: '',
          vehicleId: '',
          plate: '',
          conductorId: null as string | null,
          arrivalTime: '',
        }))

  if (assignList.length > 0) {
    lines.push(...conductorLinesFromAssignments(form, assignList))
  }

  const workerLines = workerLinesFromLegacyForm(form)
  if (workerLines.length > 0) {
    lines.push(...workerLines)
  } else if (Number(form.workers || 0) > 0 && assignList.length === 0) {
    const count = Math.min(30, Math.max(0, Math.floor(Number(form.workers))))
    for (let i = 0; i < count; i += 1) {
      lines.push(createEmptyLogisticRoleLine(form, 'treballador'))
    }
  }

  if (lines.length === 0) return [createEmptyLogisticRoleLine(form, 'treballador')]
  return lines
}

/** @deprecated use ensureLogisticRoleLines */
export function ensureLogisticWorkerLines(
  form: LogisticPhaseForm,
  assignments?: VehicleAssignment[]
) {
  return ensureLogisticRoleLines(form, assignments).filter((line) => line.role === 'treballador')
}

export function applyLogisticDefaultsToRoleLines(
  form: LogisticPhaseForm,
  lines: ServeiGroupRoleLine[]
): ServeiGroupRoleLine[] {
  const defaults = formDefaults(form)
  return lines.map((line) => ({ ...line, ...defaults }))
}

/** @deprecated */
export const applyLogisticDefaultsToWorkerLines = applyLogisticDefaultsToRoleLines

function assignmentForSlot(
  existing: VehicleAssignment[],
  slotId: string,
  conductorId?: string | null,
  arrivalTime = ''
): VehicleAssignment {
  const found = existing.find((entry) => entry.slotId === slotId)
  if (found) {
    return {
      ...found,
      slotId,
      conductorId: conductorId ?? found.conductorId ?? null,
      arrivalTime: arrivalTime || found.arrivalTime || '',
    }
  }
  return {
    slotId,
    vehicleType: '',
    vehicleId: '',
    plate: '',
    conductorId: conductorId ?? null,
    arrivalTime,
  }
}

export function syncLogisticPhaseFromRoleLines(
  form: LogisticPhaseForm,
  roleLines: ServeiGroupRoleLine[],
  existingAssignments: VehicleAssignment[]
): { formPatch: Partial<LogisticPhaseForm>; assignments: VehicleAssignment[] } {
  const allowedLines = dedupeRoleLinePersonAssignments(
    roleLines.filter((line) => line.role === 'conductor' || line.role === 'treballador')
  )
  const conductorLines = allowedLines.filter((line) => line.role === 'conductor')
  const workerLines = allowedLines.filter((line) => line.role === 'treballador')

  const assignments = conductorLines.map((line) =>
    assignmentForSlot(
      existingAssignments,
      line.slotId,
      line.personId || null,
      line.arrivalTime || form.arrivalTime || ''
    )
  )

  const workerIds = workerLines.map((line) => String(line.personId || ''))
  const workerDetails = workerLines.reduce<NonNullable<LogisticPhaseForm['workerDetails']>>(
    (acc, line) => {
      const id = String(line.personId || '').trim()
      if (!id) return acc
      acc[id] = {
        id,
        name: line.personName,
        serviceDate: line.serviceDate || form.startDate,
        meetingPoint: line.meetingPoint || form.meetingPoint,
        startTime: line.startTime || form.startTime,
        endTime: line.endTime || form.endTime,
        arrivalTime: line.arrivalTime || form.arrivalTime || '',
      }
      return acc
    },
    {}
  )

  return {
    formPatch: {
      roleLines: allowedLines,
      workerIds,
      workerDetails,
      workers: workerLines.length,
      drivers: conductorLines.length,
    },
    assignments,
  }
}

export function patchLogisticRoleLines(
  form: LogisticPhaseForm,
  assignments: VehicleAssignment[],
  updater: (lines: ServeiGroupRoleLine[]) => ServeiGroupRoleLine[]
): { formPatch: Partial<LogisticPhaseForm>; assignments: VehicleAssignment[] } {
  const current = ensureLogisticRoleLines(form, assignments)
  return syncLogisticPhaseFromRoleLines(form, updater(current), assignments)
}

/** @deprecated */
export function patchLogisticWorkerLines(
  form: LogisticPhaseForm,
  updater: (lines: ServeiGroupRoleLine[]) => ServeiGroupRoleLine[]
): Partial<LogisticPhaseForm> {
  return patchLogisticRoleLines(form, [], updater).formPatch
}

export function findAssignmentForLine(
  assignments: VehicleAssignment[],
  line: ServeiGroupRoleLine
): VehicleAssignment {
  return assignmentForSlot(
    assignments,
    line.slotId,
    line.personId || null,
    line.arrivalTime || ''
  )
}
