import {
  deriveBlockStatus,
  formatProjectCost,
  getBlockDepartments,
  getPrimaryBlockDepartment,
  sumTaskCosts,
  type KickoffAttendee,
  type ProjectData,
  type ProjectRoom,
} from './project-shared'
import { normalizeDepartment, type ResponsibleOption } from './project-workspace-helpers'

export const serializeOverviewState = (source: ProjectData) =>
  JSON.stringify({
    name: source.name,
    sponsor: source.sponsor,
    owner: source.owner,
    context: source.context,
    strategy: source.strategy,
    startDate: source.startDate,
    launchDate: source.launchDate,
    departments: [...source.departments].sort(),
    blocks: source.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      departments: [...getBlockDepartments(block)].sort(),
    })),
    documentId: source.document?.id || '',
    documentUrl: source.document?.url || '',
    documentName: source.document?.name || '',
  })

export const serializeBlocksState = (source: ProjectData) =>
  JSON.stringify({
    blocks: source.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      summary: block.summary,
      department: block.department,
      departments: [...getBlockDepartments(block)].sort(),
      owner: block.owner,
      deadline: block.deadline,
      budget: block.budget || '',
      dependsOn: block.dependsOn,
      status: deriveBlockStatus(block),
      tasks: (block.tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        department: task.department || '',
        owner: task.owner,
        deadline: task.deadline,
        dependsOn: task.dependsOn,
        cost: task.cost || '',
        priority: task.priority,
        status: task.status,
        documents: (task.documents || []).map((item) => ({
          id: item?.id || '',
          category: item?.category || 'other',
          label: item?.label || item?.name || '',
          name: item?.name || '',
          path: item?.path || '',
          url: item?.url || '',
          size: item?.size || 0,
          type: item?.type || '',
        })),
      })),
    })),
    kickoffMinutes: source.kickoff.minutes || '',
    kickoffMinutesStatus: source.kickoff.minutesStatus || 'open',
    kickoffMinutesAuthor: source.kickoff.minutesAuthor || '',
    kickoffMinutesClosedAt: source.kickoff.minutesClosedAt || '',
    kickoffMinutesUpdatedAt: source.kickoff.minutesUpdatedAt || '',
    kickoffAttendees: (source.kickoff.attendees || []).map((item) => ({
      key: item.key,
      name: item.name,
      department: item.department,
      email: item.email,
      attended: item.attended !== false,
    })),
  })

export const serializeRoomsState = (rooms: ProjectRoom[]) =>
  JSON.stringify(
    rooms.map((room) => ({
      id: room.id,
      name: room.name,
      kind: room.kind,
      blockId: room.blockId || '',
      opsChannelId: room.opsChannelId || '',
      opsChannelName: room.opsChannelName || '',
      opsSyncedAt: room.opsSyncedAt || 0,
      departments: [...(room.departments || [])].sort(),
      participants: [...(room.participants || [])].sort(),
      participantDetails: (room.participantDetails || [])
        .map((item) => ({
          name: item.name,
          department: item.department || '',
          role: item.role || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      notes: room.notes || '',
      documents: (room.documents || []).map((item) => ({
        id: item?.id || '',
        name: item?.name || '',
        label: item?.label || '',
        url: item?.url || '',
      })),
    }))
  )

export const sameStringSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  const normalizedLeft = [...left].sort()
  const normalizedRight = [...right].sort()
  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

export const buildParticipantDetails = (
  names: string[],
  userByName: Map<string, ResponsibleOption>
) =>
  [...new Set(names.filter(Boolean))].map((name) => {
    const user = userByName.get(name)
    return {
      name,
      department: user?.department || '',
      role: user?.role || '',
    }
  })

export const ensureProjectRooms = (
  currentProject: ProjectData,
  userByName: Map<string, ResponsibleOption>
) => {
  const autoRooms = currentProject.blocks.map((block) => {
    const existingRoom = currentProject.rooms.find(
      (room) => room.kind === 'block' && room.blockId === block.id
    )
    const participantNames = [
      currentProject.owner,
      block.owner,
      ...block.tasks.map((task) => task.owner),
      ...(existingRoom?.participants || []),
    ].filter(Boolean)

    return {
      id: existingRoom?.id || `room-block-${block.id}`,
      name: block.name || getPrimaryBlockDepartment(block) || 'Sala de bloc',
      kind: 'block' as const,
      blockId: block.id,
      opsChannelId: existingRoom?.opsChannelId || '',
      opsChannelName:
        existingRoom?.opsChannelName ||
        (block.name || getPrimaryBlockDepartment(block) || 'Sala de bloc'),
      opsChannelSource: 'projects' as const,
      opsSyncedAt: existingRoom?.opsSyncedAt || 0,
      departments: getBlockDepartments(block),
      participants: [...new Set(participantNames)],
      participantDetails: buildParticipantDetails(participantNames, userByName),
      notes: existingRoom?.notes || '',
      documents: existingRoom?.documents || [],
      messages: existingRoom?.messages || [],
    }
  })

  return {
    ...currentProject,
    rooms: autoRooms,
  }
}

export const deriveKickoffAttendees = (
  project: ProjectData,
  usersCatalog: ResponsibleOption[],
  userByName: Map<string, ResponsibleOption>
) => {
  const byKey = new Map(project.kickoff.attendees.map((item) => [item.key, item]))
  const nextAttendees: KickoffAttendee[] = []

  const addAutoAttendee = (
    key: string,
    userId: string,
    name: string,
    email: string,
    department: string
  ) => {
    if (!email || project.kickoff.excludedKeys.includes(key)) return
    const existing = byKey.get(key)
    if (existing) {
      nextAttendees.push(existing)
      return
    }
    nextAttendees.push({
      key,
      userId,
      name,
      email,
      department,
      attended: true,
    })
  }

  const ownerUser = userByName.get(project.owner)
  if (ownerUser) {
    addAutoAttendee(
      `user:${ownerUser.id}`,
      ownerUser.id,
      ownerUser.name,
      ownerUser.email,
      'Responsable projecte'
    )
  }

  const sponsorUser = userByName.get(project.sponsor)
  if (sponsorUser) {
    addAutoAttendee(
      `user:${sponsorUser.id}`,
      sponsorUser.id,
      sponsorUser.name,
      sponsorUser.email,
      'Impulsor'
    )
  }

  project.departments.forEach((department) => {
    usersCatalog
      .filter(
        (user) =>
          user.role === 'cap' &&
          user.email &&
          normalizeDepartment(user.department || '') === normalizeDepartment(department)
      )
      .forEach((user) => {
        addAutoAttendee(`user:${user.id}`, user.id, user.name, user.email, department)
      })
  })

  for (const item of project.kickoff.attendees) {
    if (!nextAttendees.some((entry) => entry.key === item.key)) {
      nextAttendees.push(item)
    }
  }

  return nextAttendees.filter(
    (item, index, array) => array.findIndex((entry) => entry.key === item.key) === index
  )
}

export const syncBlockBudgets = (project: ProjectData) => ({
  ...project,
  blocks: project.blocks.map((block) => ({
    ...block,
    budget: formatProjectCost(sumTaskCosts(block.tasks || [])),
  })),
})
