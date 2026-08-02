export const normalizeParticipantName = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export type RoomAccessUser = {
  id?: string
  name?: string
  role?: string
}

export type RoomAccessProject = {
  owner?: string
  ownerUserId?: string
  sponsor?: string
  createdById?: string
}

export type RoomAccessBlock = {
  owner?: string
  tasks?: Array<{ owner?: string }>
}

export type RoomAccessRoom = {
  participants?: string[]
  kind?: string
}

export function canAccessGeneralRoom(
  user: RoomAccessUser,
  project: RoomAccessProject,
  projectBlocks?: RoomAccessBlock[],
  room?: RoomAccessRoom | null
): boolean {
  if (canManageProjectForRoom(user, project)) return true

  const userName = normalizeParticipantName(user.name)
  if (!userName) return false

  const blocks = projectBlocks || []
  if (blocks.some((block) => normalizeParticipantName(block.owner) === userName)) return true

  const participants = room?.participants || []
  return participants.some((participant) => normalizeParticipantName(participant) === userName)
}

export function canManageProjectForRoom(
  user: RoomAccessUser,
  project: RoomAccessProject
): boolean {
  const role = String(user.role || '').trim()
  const userId = String(user.id || '').trim()
  const userName = normalizeParticipantName(user.name)

  if (role === 'admin') return true
  if (userId && userId === String(project.ownerUserId || '').trim()) return true
  if (userId && userId === String(project.createdById || '').trim()) return true
  if (userName && userName === normalizeParticipantName(project.owner)) return true
  if (userName && userName === normalizeParticipantName(project.sponsor)) return true

  return false
}

export function canAccessBlockRoom(
  user: RoomAccessUser,
  project: RoomAccessProject,
  block: RoomAccessBlock | null | undefined,
  room?: RoomAccessRoom | null
): boolean {
  if (!block) return false
  if (canManageProjectForRoom(user, project)) return true

  const userName = normalizeParticipantName(user.name)
  if (!userName) return false

  if (userName === normalizeParticipantName(block.owner)) return true

  const tasks = block.tasks || []
  if (tasks.some((task) => normalizeParticipantName(task.owner) === userName)) return true

  const participants = room?.participants || []
  if (participants.some((participant) => normalizeParticipantName(participant) === userName)) {
    return true
  }

  return false
}
