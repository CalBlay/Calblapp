import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'
import type { LogisticPhaseForm, LogisticPhaseKey, ServeiGroupRoleLine, VehicleAssignment } from '../phaseConfig'
import { extractDraftResponsible } from './quadrantPayloadShared'
import { normalizeTransportPlateKey, normalizeTransportType } from '@/lib/transportTypes'

const normPerson = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const makeSlotId = () => `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`

const normalizePhaseKey = (value?: string | null): LogisticPhaseKey | null => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'event' || normalized.includes('event')) return 'event'
  if (normalized === 'entrega' || normalized.includes('entrega')) return 'entrega'
  if (normalized === 'recollida' || normalized.includes('recollida')) return 'recollida'
  return null
}

export type HydratedLogisticPhase = {
  form: LogisticPhaseForm
  assignments: VehicleAssignment[]
}

/** Reconstrueix form + vehicles d'una fase logística des d'un borrador. */
export function hydrateLogisticPhaseFromDraft(
  draft: EditorDraftInput,
  phaseKey: LogisticPhaseKey,
  fallback: LogisticPhaseForm
): HydratedLogisticPhase | null {
  const draftPhaseKey = normalizePhaseKey(
    draft.phaseType || (draft as { phaseLabel?: string }).phaseLabel
  )
  if (draftPhaseKey && draftPhaseKey !== phaseKey) return null
  if (!draftPhaseKey && phaseKey !== 'event') return null

  const { id: responsableId, name: responsableName } = extractDraftResponsible(draft)
  const responsableNorm = normPerson(responsableName || responsableId)

  const baseDate = String(draft.startDate || fallback.startDate || '')
  const meetingPoint = String(draft.meetingPoint || fallback.meetingPoint || 'CENTRAL')
  const startTime = String(draft.startTime || fallback.startTime || '')
  const endTime = String(draft.endTime || fallback.endTime || '')
  const arrivalTime = String(draft.arrivalTime || fallback.arrivalTime || '')

  const conductors = Array.isArray(draft.conductors) ? draft.conductors : []
  const workers = Array.isArray(draft.treballadors) ? draft.treballadors : []

  const conductorNorms = new Set<string>()
  const roleLines: ServeiGroupRoleLine[] = []
  const assignments: VehicleAssignment[] = []

  conductors.forEach((conductor, idx) => {
    const personId = String(conductor.id || '').trim()
    const personName = String(conductor.name || '').trim()
    const personNorm = normPerson(personName || personId)
    if (!personNorm) return
    if (conductorNorms.has(personNorm)) return
    conductorNorms.add(personNorm)

    const slotId = `conductor-${phaseKey}-${idx}`
    roleLines.push({
      slotId,
      role: 'conductor',
      personId,
      personName,
      serviceDate: conductor.startDate || baseDate,
      meetingPoint: conductor.meetingPoint || meetingPoint,
      startTime: conductor.startTime || startTime,
      endTime: conductor.endTime || endTime,
      arrivalTime: conductor.arrivalTime || arrivalTime,
    })
    assignments.push({
      slotId,
      vehicleType: normalizeTransportType(String(conductor.vehicleType || '')),
      vehicleId: '',
      plate: String(conductor.plate || '').trim(),
      conductorId: personId || null,
      arrivalTime: String(conductor.arrivalTime || arrivalTime),
    })
  })

  workers.forEach((worker, idx) => {
    const personId = String(worker.id || '').trim()
    const personName = String(worker.name || '').trim()
    const personNorm = normPerson(personName || personId)
    if (!personNorm || personNorm === 'extra') return
    if (responsableNorm && personNorm === responsableNorm) return
    if (conductorNorms.has(personNorm)) return

    roleLines.push({
      slotId: `worker-${phaseKey}-${idx}`,
      role: 'treballador',
      personId,
      personName,
      serviceDate: worker.startDate || baseDate,
      meetingPoint: worker.meetingPoint || meetingPoint,
      startTime: worker.startTime || startTime,
      endTime: worker.endTime || endTime,
      arrivalTime: worker.arrivalTime || arrivalTime,
    })
  })

  if (roleLines.length === 0) {
    roleLines.push({
      slotId: makeSlotId(),
      role: 'treballador',
      personId: '',
      personName: '',
      serviceDate: baseDate,
      meetingPoint,
      startTime,
      endTime,
      arrivalTime,
    })
  }

  const workerLines = roleLines.filter((line) => line.role === 'treballador')
  const workerIds = workerLines.map((line) => line.personId)
  const workerDetails = workerLines.reduce<NonNullable<LogisticPhaseForm['workerDetails']>>(
    (acc, line) => {
      const id = String(line.personId || '').trim()
      if (!id) return acc
      acc[id] = {
        id,
        name: line.personName,
        serviceDate: line.serviceDate || baseDate,
        meetingPoint: line.meetingPoint || meetingPoint,
        startTime: line.startTime || startTime,
        endTime: line.endTime || endTime,
        arrivalTime: line.arrivalTime || arrivalTime,
      }
      return acc
    },
    {}
  )

  void responsableId

  return {
    form: {
      ...fallback,
      startDate: baseDate,
      endDate: String(draft.endDate || baseDate),
      startTime,
      endTime,
      arrivalTime,
      meetingPoint,
      roleLines,
      workerIds,
      workerDetails,
      workers: workerLines.length,
      drivers: assignments.length,
    },
    assignments,
  }
}

/** Exclou treballadors que ja són responsable o conductor al desar manualment. */
export function shouldSkipManualStaffName(
  name: string,
  responsible: { name: string } | null,
  driverNorms: Set<string>
): boolean {
  const nn = normPerson(name)
  if (!nn || nn === 'extra') return true
  if (responsible && nn === normPerson(responsible.name)) return true
  if (driverNorms.has(nn)) return true
  return false
}
