import type { CuinaGroup } from '../components/quadrantModalTypes'
import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'
import type { ServeiGroupRoleLine, VehicleAssignment } from '../phaseConfig'
import { makeGroupId } from '../components/quadrantModalUtils'
import { getExternalWorkerTypeFromName } from '@/lib/quadrantExternalWorkers'

type HydrateParams = {
  draft: EditorDraftInput
  fallback: Partial<CuinaGroup>
}

/** Reconstrueix grups Cuina des d'un borrador Firestore per al nou editor de role lines. */
export function hydrateCuinaGroupsFromDraft({
  draft,
  fallback,
}: HydrateParams): CuinaGroup[] {
  const draftGroups = Array.isArray(draft.groups) ? draft.groups : []
  const conductors = Array.isArray(draft.conductors) ? draft.conductors : []
  const workers = Array.isArray(draft.treballadors) ? draft.treballadors : []

  const baseMeeting = String(draft.meetingPoint || fallback.meetingPoint || 'CENTRAL')
  const baseStart = String(draft.startTime || fallback.startTime || '')
  const baseEnd = String(draft.endTime || fallback.endTime || '')
  const baseArrival = String(draft.arrivalTime || fallback.arrivalTime || '')
  const baseDate = String(draft.startDate || fallback.serviceDate || '')

const normPerson = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  const buildGroup = (seed: Partial<CuinaGroup>, conductorIdx: number): CuinaGroup => {
    const conductor = conductors[conductorIdx]
    const roleLines: ServeiGroupRoleLine[] = []
    const vehicleAssignments: VehicleAssignment[] = []

    const respId = String(seed.responsibleId || draft.responsableId || '').trim()
    const respName =
      String(seed.responsibleName || draft.responsableName || '').trim() ||
      (typeof draft.responsable?.name === 'string' ? draft.responsable.name : '')

    const driverId = String(seed.driverId || conductor?.id || '').trim()
    const driverName = String(seed.driverName || conductor?.name || '').trim()
    const hasDriver = seed.needsDriver !== false && (Number(seed.drivers || 0) > 0 || Boolean(driverId || driverName))
    const sameRespAndDriver =
      Boolean(respId && driverId && respId === driverId) ||
      Boolean(respName && driverName && normPerson(respName) === normPerson(driverName))

    if (seed.wantsResponsible !== false && (respId || respName) && !sameRespAndDriver) {
      roleLines.push({
        slotId: `resp-${seed.id || makeGroupId()}`,
        role: 'responsable',
        personId: respId,
        personName: respName,
        serviceDate: seed.serviceDate || baseDate,
        meetingPoint: seed.meetingPoint || baseMeeting,
        startTime: seed.startTime || baseStart,
        endTime: seed.endTime || baseEnd,
        arrivalTime: seed.arrivalTime || baseArrival,
      })
    }

    if (hasDriver) {
      const slotId = `conductor-${seed.id || makeGroupId()}-${conductorIdx}`
      roleLines.push({
        slotId,
        role: 'conductor',
        personId: driverId,
        personName: driverName,
        serviceDate: seed.serviceDate || baseDate,
        meetingPoint: seed.meetingPoint || baseMeeting,
        startTime: seed.startTime || baseStart,
        endTime: seed.endTime || baseEnd,
        arrivalTime: conductor?.arrivalTime || seed.arrivalTime || baseArrival,
      })
      vehicleAssignments.push({
        slotId,
        vehicleType: String(conductor?.vehicleType || ''),
        vehicleId: '',
        plate: String(conductor?.plate || ''),
        conductorId: driverId || null,
        arrivalTime: String(conductor?.arrivalTime || seed.arrivalTime || baseArrival),
      })
    }

    const reservedNorms = new Set<string>()
    if (respId || respName) reservedNorms.add(normPerson(respId || respName))
    if (driverId || driverName) reservedNorms.add(normPerson(driverId || driverName))

    workers.forEach((w, idx) => {
      const id = String(w.id || '').trim()
      const personName = String(w.name || '').trim()
      const wNorm = normPerson(personName || id)
      if (wNorm && reservedNorms.has(wNorm)) return
      const externalType = getExternalWorkerTypeFromName(personName)
      const isCenterExternalExtra = externalType === 'centerExternalExtra'
      if (!id && !personName) return
      if (wNorm === 'extra' && !externalType) return

      roleLines.push({
        slotId: `worker-${seed.id || makeGroupId()}-${idx}`,
        role: 'treballador',
        personId: id,
        personName,
        isExternal: Boolean(externalType) || (w as { isExternal?: boolean }).isExternal === true,
        externalType: externalType || undefined,
        isCenterExternalExtra,
        serviceDate: w.startDate || baseDate,
        meetingPoint: w.meetingPoint || seed.meetingPoint || baseMeeting,
        startTime: w.startTime || baseStart,
        endTime: w.endTime || baseEnd,
        arrivalTime: w.arrivalTime || baseArrival,
      })
    })

    if (roleLines.length === 0) {
      roleLines.push({
        slotId: `worker-${seed.id || makeGroupId()}-0`,
        role: 'treballador',
        personId: '',
        personName: '',
        serviceDate: seed.serviceDate || baseDate,
        meetingPoint: seed.meetingPoint || baseMeeting,
        startTime: seed.startTime || baseStart,
        endTime: seed.endTime || baseEnd,
        arrivalTime: seed.arrivalTime || baseArrival,
      })
    }

    const workerLines = roleLines.filter((line) => line.role === 'treballador')
    const workerIds = workerLines.map((line) => {
      const id = String(line.personId || '').trim()
      return id || `__slot__:${line.slotId}`
    })
    const workerDetails = workerLines.reduce<NonNullable<CuinaGroup['workerDetails']>>((acc, line) => {
      const key = String(line.personId || '').trim() || `__slot__:${line.slotId}`
      acc[key] = {
        id: String(line.personId || '').trim(),
        name: line.personName,
        serviceDate: line.serviceDate || seed.serviceDate || baseDate,
        meetingPoint: line.meetingPoint || seed.meetingPoint || baseMeeting,
        startTime: line.startTime || seed.startTime || baseStart,
        endTime: line.endTime || seed.endTime || baseEnd,
        arrivalTime: line.arrivalTime || seed.arrivalTime || baseArrival,
      }
      return acc
    }, {})

    return {
      id: seed.id || makeGroupId(),
      meetingPoint: seed.meetingPoint || baseMeeting,
      serviceDate: seed.serviceDate || baseDate,
      startTime: seed.startTime || baseStart,
      endTime: seed.endTime || baseEnd,
      arrivalTime: seed.arrivalTime || baseArrival,
      workers: Math.max(Number(seed.workers || 0), roleLines.filter((l) => l.role === 'treballador').length),
      drivers: hasDriver ? Math.max(1, Number(seed.drivers || 0)) : 0,
      needsDriver: hasDriver,
      wantsResponsible: seed.wantsResponsible !== false && Boolean(respId || respName),
      responsibleId: respId,
      driverMode: sameRespAndDriver ? '__responsable__' : driverId || '__auto__',
      vehicleType: String(conductor?.vehicleType || ''),
      driverAssignments: hasDriver
        ? [
            {
              vehicleType: String(conductor?.vehicleType || ''),
              driverMode: sameRespAndDriver ? '__responsable__' : driverId || '__auto__',
            },
          ]
        : [],
      roleLines,
      vehicleAssignments,
      workerIds,
      workerDetails,
    }
  }

  if (draftGroups.length > 0) {
    return draftGroups.map((group, idx) =>
      buildGroup(
        {
          id: group.id || makeGroupId(),
          serviceDate: group.serviceDate || baseDate,
          meetingPoint: group.meetingPoint || baseMeeting,
          startTime: group.startTime || baseStart,
          endTime: group.endTime || baseEnd,
          arrivalTime: group.arrivalTime || baseArrival,
          workers: group.workers,
          drivers: group.drivers,
          needsDriver: group.needsDriver,
          wantsResponsible: group.wantsResponsible,
          responsibleId: group.responsibleId || undefined,
          responsibleName: group.responsibleName || undefined,
          driverId: group.driverId || undefined,
          driverName: group.driverName || undefined,
        },
        idx
      )
    )
  }

  return [buildGroup(fallback, 0)]
}
