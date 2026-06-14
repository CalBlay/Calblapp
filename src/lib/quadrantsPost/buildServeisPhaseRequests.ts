import { type DriverCrewPremise } from '@/services/premises'
import { norm, normalizeJamoneroAssignment } from '@/lib/quadrantsPost/utils'
import type {
  JamoneroAssignmentNormalized,
  JamoneroAssignmentRaw,
  PhaseRequest,
  ServeisGroupInput,
} from '@/lib/quadrantsPost/types'

export type BuildServeisPhaseRequestsParams = {
  body: Record<string, unknown>
  mode: 'auto' | 'semi' | 'manual'
  getDepartmentPeople: () => Promise<
    Array<{
      id?: string
      name?: string
      isJamonero?: boolean
      isDriver?: boolean
    }>
  >
  getPremisesData: () => Promise<{
    premises?: { driverCrews?: DriverCrewPremise[] }
    warnings?: string[]
  }>
}

export async function buildServeisPhaseRequests(
  params: BuildServeisPhaseRequestsParams
): Promise<{ phaseRequests: PhaseRequest[]; remainingServiceEventGroups: number }> {
  const { body, mode, getDepartmentPeople, getPremisesData } = params
  let phaseRequests: PhaseRequest[] = []
  let remainingServiceEventGroups = 0

  const eventDate = body.startDate
  const serviceAssignments: JamoneroAssignmentNormalized[] = Array.isArray(body.serviceJamoneroAssignments)
    ? (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(normalizeJamoneroAssignment)
    : []
  const manualServiceJamonero = serviceAssignments.find(
    (assignment) => assignment?.mode === 'manual' && (assignment?.personnelId || assignment?.personnelName)
  )
  const hasAutoServiceJamonero = serviceAssignments.some((assignment) => assignment?.mode !== 'manual')
  /** Mode manual: no es resolen jameners "auto" ni es fan splits per equip (estalvia premises + recorreguts). */
  const effectiveHasAutoServiceJamonero = hasAutoServiceJamonero && mode !== 'manual'
  const departmentPeople =
    manualServiceJamonero || effectiveHasAutoServiceJamonero ? await getDepartmentPeople() : []
  const premisesData =
    manualServiceJamonero || effectiveHasAutoServiceJamonero
      ? await getPremisesData()
      : { premises: { driverCrews: [] as DriverCrewPremise[] } }
  const driverCrews = Array.isArray(premisesData?.premises?.driverCrews)
    ? premisesData.premises.driverCrews
    : []
  const findPerson = (ref?: { id?: string | null; name?: string | null }) =>
    departmentPeople.find((person) => {
      if (ref?.id && person.id === ref.id) return true
      if (ref?.name && norm(person.name) === norm(ref.name)) return true
      return false
    }) || null
  const findCrewByDriver = (ref?: { id?: string | null; name?: string | null }) =>
    driverCrews.find((crew) => {
      const driver = findPerson({ id: crew.driverId, name: crew.driverName })
      if (!driver) return false
      if (ref?.id && driver.id === ref.id) return true
      if (ref?.name && norm(driver.name) === norm(ref.name)) return true
      return false
    }) || null
  const findCrewByCompanion = (ref?: { id?: string | null; name?: string | null }) =>
    driverCrews.find((crew) =>
      crew.companions.some((companion) => {
        const companionPerson = findPerson({ id: companion.id, name: companion.name })
        if (!companionPerson) return false
        if (ref?.id && companionPerson.id === ref.id) return true
        if (ref?.name && norm(companionPerson.name) === norm(ref.name)) return true
        return false
      })
    ) || null
  const crewContainsPerson = (crew: DriverCrewPremise | null, person: { id?: string | null; name?: string | null } | null) => {
    if (!crew || !person) return false
    const driver = findPerson({ id: crew.driverId, name: crew.driverName })
    if (driver) {
      if (person.id && driver.id === person.id) return true
      if (person.name && norm(driver.name) === norm(person.name)) return true
    }
    return crew.companions.some((companion) => {
      const companionPerson = findPerson({ id: companion.id, name: companion.name })
      if (!companionPerson) return false
      if (person.id && companionPerson.id === person.id) return true
      if (person.name && norm(companionPerson.name) === norm(person.name)) return true
      return false
    })
  }
  const existingGroupMatchesCrew = (
    groups: ServeisGroupInput[],
    currentIndex: number,
    driverId?: string | null,
    serviceDate?: string
  ) =>
    groups.some((candidate, candidateIndex) => {
      if (candidateIndex === currentIndex) return false
      const candidateDate = candidate?.serviceDate || (body.startDate as string)
      if (serviceDate && candidateDate !== serviceDate) return false
      const candidateLabel =
        (candidate?.dateLabel || '').toString().trim() ||
        (candidateDate === eventDate ? 'Event' : 'Muntatge')
      if (norm(candidateLabel) !== 'event') return false
      return Boolean(driverId) && String(candidate?.driverId || '').trim() === String(driverId || '').trim()
    })
  const groups = body.groups as ServeisGroupInput[]
  const existingEventGroupsCount = groups.filter((candidate) => {
    const candidateDate = candidate?.serviceDate || (body.startDate as string)
    if (candidateDate !== eventDate) return false
    const candidateLabel =
      (candidate?.dateLabel || '').toString().trim() ||
      (candidateDate === eventDate ? 'Event' : 'Muntatge')
    return norm(candidateLabel) === 'event'
  }).length
  const canAutoCreateExtraEventGroup =
    existingEventGroupsCount <= 1 && Array.isArray(body.groups) && groups.length === 1

  groups.forEach((g, groupIndex: number) => {
    const serviceDate = g.serviceDate || (body.startDate as string)
    const label =
      (g.dateLabel || '').toString().trim() ||
      (serviceDate === eventDate ? 'Event' : 'Muntatge')
    const wantsResp =
      typeof g.wantsResponsible === 'boolean'
        ? g.wantsResponsible
        : body.skipResponsible
        ? false
        : true
    const isPrimaryResponsibleEventGroup =
      groupIndex === 0 &&
      serviceDate === eventDate &&
      Boolean(body.manualResponsibleId)
    const responsableId =
      wantsResp && (g.responsibleId || (isPrimaryResponsibleEventGroup ? body.manualResponsibleId : null))
        ? g.responsibleId || (isPrimaryResponsibleEventGroup ? (body.manualResponsibleId as string) : null)
        : null

    const responsiblePerson =
      isPrimaryResponsibleEventGroup
        ? findPerson({ id: body.manualResponsibleId as string })
        : null
    const jamoneroPerson =
      groupIndex === 0 && serviceDate === eventDate && manualServiceJamonero
        ? findPerson({
            id: manualServiceJamonero.personnelId || null,
            name: manualServiceJamonero.personnelName || null,
          })
        : null
    const responsibleCrew = responsiblePerson
      ? responsiblePerson.isDriver
        ? findCrewByDriver({ id: responsiblePerson.id, name: responsiblePerson.name })
        : findCrewByCompanion({ id: responsiblePerson.id, name: responsiblePerson.name })
      : null
    const jamoneroCrew = jamoneroPerson
      ? jamoneroPerson.isDriver
        ? findCrewByDriver({ id: jamoneroPerson.id, name: jamoneroPerson.name })
        : findCrewByCompanion({ id: jamoneroPerson.id, name: jamoneroPerson.name })
      : null
    // 1) Preferir jamonero dins del mateix equip que el responsable/conductor (mateix cotxe).
    // 2) Si no n'hi ha, cercar jamonero d'un altre equip (només es parteix en 2 fases si no és «compacte»).
    let autoJamoneroPerson: (typeof departmentPeople)[number] | null = null
    if (
      !jamoneroPerson &&
      groupIndex === 0 &&
      serviceDate === eventDate &&
      responsibleCrew &&
      effectiveHasAutoServiceJamonero
    ) {
      const inResponsibleCrew = departmentPeople.find((person) => {
        if (person.isJamonero !== true) return false
        if (body.manualResponsibleId && person.id === body.manualResponsibleId) return false
        if (!crewContainsPerson(responsibleCrew, { id: person.id, name: person.name })) return false
        const crewDriver = findPerson({
          id: responsibleCrew.driverId,
          name: responsibleCrew.driverName,
        })
        if (
          crewDriver &&
          responsiblePerson &&
          person.isDriver &&
          person.id === responsiblePerson.id
        ) {
          return false
        }
        return true
      })
      const fromOtherCrew =
        !inResponsibleCrew &&
        departmentPeople.find((person) => {
          if (person.isJamonero !== true) return false
          if (body.manualResponsibleId && person.id === body.manualResponsibleId) return false
          const personCrew = person.isDriver
            ? findCrewByDriver({ id: person.id, name: person.name })
            : findCrewByCompanion({ id: person.id, name: person.name })
          if (!personCrew) return false
          if (personCrew.id === responsibleCrew.id) return false
          if (crewContainsPerson(responsibleCrew, { id: person.id, name: person.name })) return false
          return true
        })
      autoJamoneroPerson = inResponsibleCrew || fromOtherCrew || null
    }
    const autoJamoneroCrew = autoJamoneroPerson
      ? autoJamoneroPerson.isDriver
        ? findCrewByDriver({ id: autoJamoneroPerson.id, name: autoJamoneroPerson.name })
        : findCrewByCompanion({ id: autoJamoneroPerson.id, name: autoJamoneroPerson.name })
      : null
    // Esdeveniments petits (treballadors + conductors demanats < 5): un sol vehicle amb el conductor principal.
    const serveisCompactHeadcount =
      Number(g.workers || 0) + Number(g.drivers || 0)
    const compactServeisSingleVehicle = serveisCompactHeadcount < 5

    const splitForManualJamonero =
      !compactServeisSingleVehicle &&
      label.toLowerCase() === 'event' &&
      canAutoCreateExtraEventGroup &&
      groupIndex === 0 &&
      jamoneroPerson &&
      responsibleCrew &&
      jamoneroCrew &&
      jamoneroCrew.id !== responsibleCrew.id &&
      !existingGroupMatchesCrew(groups, groupIndex, jamoneroCrew.driverId, serviceDate)
    const splitForAutoJamonero =
      !compactServeisSingleVehicle &&
      label.toLowerCase() === 'event' &&
      canAutoCreateExtraEventGroup &&
      groupIndex === 0 &&
      !manualServiceJamonero &&
      autoJamoneroPerson &&
      responsibleCrew &&
      autoJamoneroCrew &&
      autoJamoneroCrew.id !== responsibleCrew.id &&
      !existingGroupMatchesCrew(groups, groupIndex, autoJamoneroCrew.driverId, serviceDate)

    if (splitForManualJamonero || splitForAutoJamonero) {
      const selectedJamoneroPerson = jamoneroPerson || autoJamoneroPerson
      const selectedJamoneroCrew = jamoneroCrew || autoJamoneroCrew
      const selectedJamoneroAssignment: JamoneroAssignmentNormalized | null = jamoneroPerson
        ? manualServiceJamonero || null
        : autoJamoneroPerson
        ? {
            id: `auto-jamonero-${autoJamoneroPerson.id}`,
            mode: 'manual' as const,
            personnelId: autoJamoneroPerson.id,
            personnelName: autoJamoneroPerson.name,
          }
        : null

      if (!selectedJamoneroPerson || !selectedJamoneroCrew || !selectedJamoneroAssignment) {
        return
      }

      const secondGroupWorkers = selectedJamoneroPerson.isDriver ? 1 : 2
      const firstGroupWorkers = Math.max(Number(g.workers || 0) - secondGroupWorkers, 0)
      const secondGroupDriver = selectedJamoneroPerson.isDriver
        ? selectedJamoneroPerson
        : findPerson({ id: selectedJamoneroCrew?.driverId, name: selectedJamoneroCrew?.driverName })

      phaseRequests.push({
        groupId: `${g.id || 'group'}__g1`,
        label,
        phaseType: norm(label),
        date: serviceDate,
        endDate: serviceDate,
        startTime: g.startTime || (body.startTime as string),
        endTime: g.endTime || (body.endTime as string),
        totalWorkers: firstGroupWorkers,
        jamoneroCount: 0,
        numDrivers: 1,
        wantsResp: true,
        responsableId: body.manualResponsibleId as string,
        manualDriverId:
          responsiblePerson?.isDriver
            ? responsiblePerson.id
            : responsibleCrew?.driverId || null,
        meetingPoint: g.meetingPoint || (body.meetingPoint as string) || '',
        groupsOverride: [
          {
            ...g,
            id: `${g.id || 'group'}__g1`,
            workers: firstGroupWorkers,
            drivers: 1,
            needsDriver: true,
            wantsResponsible: true,
            responsibleId: body.manualResponsibleId,
            driverId:
              responsiblePerson?.isDriver
                ? responsiblePerson.id
                : responsibleCrew?.driverId || '',
          },
        ],
        serviceJamoneroAssignmentsOverride: [],
      })

      phaseRequests.push({
        groupId: `${g.id || 'group'}__g2`,
        label,
        phaseType: norm(label),
        date: serviceDate,
        endDate: serviceDate,
        startTime: g.startTime || (body.startTime as string),
        endTime: g.endTime || (body.endTime as string),
        totalWorkers: secondGroupWorkers,
        jamoneroCount: 1,
        numDrivers: 1,
        wantsResp: false,
        responsableId: null,
        manualDriverId: secondGroupDriver?.id || null,
        meetingPoint: g.meetingPoint || (body.meetingPoint as string) || '',
        groupsOverride: [
          {
            ...g,
            id: `${g.id || 'group'}__g2`,
            workers: secondGroupWorkers,
            drivers: 1,
            needsDriver: true,
            wantsResponsible: false,
            responsibleId: '',
            driverId: secondGroupDriver?.id || '',
          },
        ],
        serviceJamoneroAssignmentsOverride: [selectedJamoneroAssignment],
      })
      remainingServiceEventGroups += 2
      return
    }

    phaseRequests.push({
      groupId: g.id || null,
      label,
      phaseType: norm(label),
      date: serviceDate,
      endDate: serviceDate,
      startTime: g.startTime || (body.startTime as string),
      endTime: g.endTime || (body.endTime as string),
      totalWorkers: Number(g.workers || 0),
      jamoneroCount: 0,
      numDrivers: Number(g.drivers || 0),
      wantsResp,
      responsableId,
      manualDriverId: g.driverId || null,
      meetingPoint: g.meetingPoint || (body.meetingPoint as string) || '',
      groupsOverride: [g],
    })
    if (norm(label) === 'event') remainingServiceEventGroups += 1
  })

  if (existingEventGroupsCount > 1 && serviceAssignments.length > 0 && mode !== 'manual') {
    let remainingManualAssignments = serviceAssignments.filter(
      (assignment) => assignment?.mode === 'manual' && (assignment?.personnelId || assignment?.personnelName)
    )
    let remainingAutoAssignments = serviceAssignments.filter((assignment) => assignment?.mode !== 'manual')

    const crewForPhase = (phase: PhaseRequest) => {
      const group = Array.isArray(phase.groupsOverride) ? phase.groupsOverride[0] : null
      if (!group) return null
      const driverId = String(group.driverId || phase.manualDriverId || '').trim()
      if (driverId) return findCrewByDriver({ id: driverId })
      if (
        phase.phaseType === 'event' &&
        body.manualResponsibleId &&
        (!phase.responsableId || String(phase.responsableId).trim() === '') &&
        group?.id === groups?.[0]?.id
      ) {
        const topResponsible = findPerson({ id: body.manualResponsibleId as string })
        if (!topResponsible) return null
        return topResponsible.isDriver
          ? findCrewByDriver({ id: topResponsible.id, name: topResponsible.name })
          : findCrewByCompanion({ id: topResponsible.id, name: topResponsible.name })
      }
      if (phase.responsableId) {
        const responsible = findPerson({ id: phase.responsableId })
        if (!responsible) return null
        return responsible.isDriver
          ? findCrewByDriver({ id: responsible.id, name: responsible.name })
          : findCrewByCompanion({ id: responsible.id, name: responsible.name })
      }
      return null
    }

    const assignmentMatchesCrew = (
      assignment: JamoneroAssignmentNormalized,
      crew: DriverCrewPremise | null
    ) => {
      if (!assignment || !crew) return false
      const person = findPerson({
        id: assignment.personnelId || null,
        name: assignment.personnelName || null,
      })
      if (!person) return false
      if (person.isDriver) return false
      return crewContainsPerson(crew, { id: person.id, name: person.name })
    }

    const phaseAlreadyRepresentsPerson = (assignment: JamoneroAssignmentNormalized) => {
      const person = findPerson({
        id: assignment?.personnelId || null,
        name: assignment?.personnelName || null,
      })
      if (!person) return false

      return phaseRequests.some((phase) => {
        if (phase.phaseType !== 'event') return false
        const group = Array.isArray(phase.groupsOverride) ? phase.groupsOverride[0] : null
        const driverId = String(group?.driverId || phase.manualDriverId || '').trim()
        if (driverId && person.id && driverId === String(person.id)) return true
        const crew = crewForPhase(phase)
        return crewContainsPerson(crew, { id: person.id, name: person.name })
      })
    }

    const createExtraDriverPhase = (assignment: JamoneroAssignmentNormalized) => {
      const person = findPerson({
        id: assignment?.personnelId || null,
        name: assignment?.personnelName || null,
      })
      if (!person?.isDriver) return false

      const donorCandidates = phaseRequests
        .map((phase, index) => ({ phase, index }))
        .filter(({ phase }) => phase.phaseType === 'event')
        .filter(({ phase }) => Number(phase.totalWorkers || 0) > 1)
        .sort((a, b) => {
          const aIsResponsibleGroup = Boolean(String(a.phase.responsableId || '').trim())
          const bIsResponsibleGroup = Boolean(String(b.phase.responsableId || '').trim())
          if (aIsResponsibleGroup !== bIsResponsibleGroup) return aIsResponsibleGroup ? 1 : -1
          return Number(b.phase.totalWorkers || 0) - Number(a.phase.totalWorkers || 0)
        })

      const donor = donorCandidates[0]
      if (!donor) return false

      const donorGroup = Array.isArray(donor.phase.groupsOverride) ? donor.phase.groupsOverride[0] : null
      if (!donorGroup) return false

      const nextWorkers = Math.max(Number(donor.phase.totalWorkers || 0) - 1, 1)
      phaseRequests[donor.index] = {
        ...donor.phase,
        totalWorkers: nextWorkers,
        groupsOverride: [
          {
            ...donorGroup,
            workers: nextWorkers,
          },
        ],
      }

      const baseId = String(donor.phase.groupId || donorGroup.id || 'group')
      phaseRequests.push({
        groupId: `${baseId}__extra_${String(person.id || 'driver')}`,
        label: donor.phase.label,
        phaseType: donor.phase.phaseType,
        date: donor.phase.date,
        endDate: donor.phase.endDate,
        startTime: donor.phase.startTime,
        endTime: donor.phase.endTime,
        totalWorkers: 1,
        jamoneroCount: 1,
        numDrivers: 1,
        wantsResp: false,
        responsableId: null,
        manualDriverId: person.id,
        meetingPoint: donor.phase.meetingPoint || (body.meetingPoint as string) || '',
        groupsOverride: [
          {
            ...donorGroup,
            id: `${baseId}__extra_${String(person.id || 'driver')}`,
            workers: 1,
            drivers: 1,
            needsDriver: true,
            wantsResponsible: false,
            responsibleId: '',
            driverId: person.id,
          },
        ],
        serviceJamoneroAssignmentsOverride: [assignment],
      })
      remainingServiceEventGroups += 1
      return true
    }

    const driverManualAssignments = remainingManualAssignments.filter((assignment) =>
      Boolean(
          findPerson({
            id: assignment?.personnelId || null,
            name: assignment?.personnelName || null,
          })?.isDriver
        )
      ).filter((assignment) => !phaseAlreadyRepresentsPerson(assignment))
    driverManualAssignments.forEach((assignment) => {
      if (createExtraDriverPhase(assignment)) {
        remainingManualAssignments = remainingManualAssignments.filter((candidate) => candidate !== assignment)
      }
    })

    phaseRequests = phaseRequests.map((phase) => {
      if (phase.phaseType !== 'event') return phase
      const crew = crewForPhase(phase)
      const currentOverrides = Array.isArray(phase.serviceJamoneroAssignmentsOverride)
        ? phase.serviceJamoneroAssignmentsOverride
        : []

      const matchedManual = remainingManualAssignments.find((assignment) =>
        assignmentMatchesCrew(assignment, crew)
      )
      if (matchedManual) {
        remainingManualAssignments = remainingManualAssignments.filter(
          (assignment) => assignment !== matchedManual
        )
        return {
          ...phase,
          serviceJamoneroAssignmentsOverride: [...currentOverrides, matchedManual],
        }
      }

      return {
        ...phase,
        serviceJamoneroAssignmentsOverride: currentOverrides,
      }
    })

    if (remainingManualAssignments.length > 0) {
      const eventPhaseIndexes = phaseRequests
        .map((phase, index) => ({ phase, index }))
        .filter(({ phase }) => phase.phaseType === 'event')
        .sort((a, b) => {
          const aHasDriver = Boolean(String(a.phase.manualDriverId || a.phase.groupsOverride?.[0]?.driverId || '').trim())
          const bHasDriver = Boolean(String(b.phase.manualDriverId || b.phase.groupsOverride?.[0]?.driverId || '').trim())
          if (aHasDriver !== bHasDriver) return aHasDriver ? -1 : 1
          const aOverrides = Array.isArray(a.phase.serviceJamoneroAssignmentsOverride)
            ? a.phase.serviceJamoneroAssignmentsOverride.length
            : 0
          const bOverrides = Array.isArray(b.phase.serviceJamoneroAssignmentsOverride)
            ? b.phase.serviceJamoneroAssignmentsOverride.length
            : 0
          return aOverrides - bOverrides
        })

      remainingManualAssignments.forEach((assignment, idx) => {
        const target = eventPhaseIndexes[idx % Math.max(eventPhaseIndexes.length, 1)]
        if (!target) return
        const targetPhase = phaseRequests[target.index]
        const current: JamoneroAssignmentNormalized[] = Array.isArray(
          targetPhase?.serviceJamoneroAssignmentsOverride
        )
          ? targetPhase.serviceJamoneroAssignmentsOverride
          : []
        phaseRequests[target.index] = {
          ...targetPhase,
          serviceJamoneroAssignmentsOverride: [...current, assignment],
        }
      })
      remainingManualAssignments = []
    }

    if (remainingAutoAssignments.length > 0) {
      const eventPhaseIndexes = phaseRequests
        .map((phase, index) => ({ phase, index }))
        .filter(({ phase }) => phase.phaseType === 'event')
        .sort((a, b) => {
          const aOverrides = Array.isArray(a.phase.serviceJamoneroAssignmentsOverride)
            ? a.phase.serviceJamoneroAssignmentsOverride.length
            : 0
          const bOverrides = Array.isArray(b.phase.serviceJamoneroAssignmentsOverride)
            ? b.phase.serviceJamoneroAssignmentsOverride.length
            : 0
          if (aOverrides !== bOverrides) return aOverrides - bOverrides
          return Number(b.phase.totalWorkers || 0) - Number(a.phase.totalWorkers || 0)
        })

      remainingAutoAssignments.forEach((assignment, idx) => {
        const target = eventPhaseIndexes[idx % Math.max(eventPhaseIndexes.length, 1)]
        if (!target) return
        const targetPhase = phaseRequests[target.index]
        const current: JamoneroAssignmentNormalized[] = Array.isArray(
          targetPhase?.serviceJamoneroAssignmentsOverride
        )
          ? targetPhase.serviceJamoneroAssignmentsOverride
          : []
        phaseRequests[target.index] = {
          ...targetPhase,
          serviceJamoneroAssignmentsOverride: [...current, assignment],
        }
      })
      remainingAutoAssignments = []
    }
  }

  return { phaseRequests, remainingServiceEventGroups }
}
