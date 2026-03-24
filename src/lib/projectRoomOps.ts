import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export type ProjectRoomLike = Record<string, unknown> & {
  id?: string
  name?: string
  kind?: 'block' | 'manual'
  blockId?: string
  departments?: string[]
  participants?: string[]
  opsChannelId?: string
  opsChannelName?: string
  opsChannelSource?: 'projects'
  opsSyncedAt?: number
}

export type ProjectBlockLike = Record<string, unknown> & {
  id?: string
  name?: string
  owner?: string
  tasks?: Record<string, unknown>[]
}

type ProjectLike = {
  id: string
  name?: string
  owner?: string
  rooms?: ProjectRoomLike[]
  blocks?: ProjectBlockLike[]
}

type UserRecord = {
  id: string
  name: string
  nameFold: string
}

const normalizeText = (value?: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export const buildProjectRoomChannelId = (projectId: string, roomId: string) =>
  `project_room_${projectId}_${roomId}`

export async function archiveProjectRoomOpsChannel(params: {
  projectId: string
  roomId: string
  room?: Pick<ProjectRoomLike, 'opsChannelId' | 'name'>
}) {
  const { projectId, roomId, room } = params
  const channelId = room?.opsChannelId || buildProjectRoomChannelId(projectId, roomId)
  const now = Date.now()

  await db.collection('channels').doc(channelId).set(
    {
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
      location: String(room?.name || '').trim() || undefined,
    },
    { merge: true }
  )

  return { channelId }
}

async function findUserByName(rawName: string): Promise<UserRecord | null> {
  const name = String(rawName || '').trim()
  if (!name) return null

  let snap = await db.collection('users').where('name', '==', name).limit(1).get()
  if (snap.empty) {
    snap = await db.collection('users').where('nameFold', '==', normalizeText(name)).limit(1).get()
  }
  if (snap.empty) return null

  const doc = snap.docs[0]
  const data = doc.data() as Record<string, unknown>
  return {
    id: doc.id,
    name: String(data.name || '').trim() || name,
    nameFold: String(data.nameFold || '').trim() || normalizeText(name),
  }
}

export async function syncProjectRoomOpsChannel(params: {
  project: ProjectLike
  roomId: string
}) {
  const { project, roomId } = params
  const rooms = Array.isArray(project.rooms) ? [...project.rooms] : []
  const roomIndex = rooms.findIndex((room) => String(room.id || '') === roomId)
  if (roomIndex < 0) {
    throw new Error('Sala no trobada')
  }

  const room = rooms[roomIndex]
  const now = Date.now()
  const channelId = String(room.opsChannelId || '') || buildProjectRoomChannelId(project.id, String(room.id || roomId))
  const block = (project.blocks || []).find((item) => String(item.id || '') === String(room.blockId || ''))
  const responsibleName = String(block?.owner || project.owner || '').trim()
  const responsibleUser = responsibleName ? await findUserByName(responsibleName) : null

  const participantNames = [...new Set((room.participants || []).map((name) => String(name || '').trim()).filter(Boolean))]
  const resolvedMembers = (
    await Promise.all(
      participantNames.map(async (name) => {
        const user = await findUserByName(name)
        if (!user) return null
        return {
          userId: user.id,
          userName: user.name,
        }
      })
    )
  ).filter(Boolean) as Array<{ userId: string; userName: string }>

  const roomName = String(room.name || '').trim() || 'Sala'
  const channelPayload = {
    name: roomName,
    type: 'group',
    source: 'projects',
    location: roomName,
    projectId: project.id,
    projectName: String(project.name || '').trim(),
    roomId: String(room.id || roomId),
    roomName,
    roomKind: room.kind || 'manual',
    blockId: String(room.blockId || ''),
    departments: Array.isArray(room.departments) ? room.departments.map(String).filter(Boolean) : [],
    responsibleUserId: responsibleUser?.id || null,
    responsibleUserName: responsibleUser?.name || responsibleName || null,
    status: 'active',
    updatedAt: now,
  }

  await db.collection('channels').doc(channelId).set(channelPayload, { merge: true })

  const existingMembersSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .get()

  const existingByUserId = new Map(
    existingMembersSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return [String(data.userId || ''), doc]
    })
  )
  const nextMemberIds = new Set(resolvedMembers.map((member) => member.userId))

  const batch = db.batch()

  for (const member of resolvedMembers) {
    const ref = db.collection('channelMembers').doc(`${channelId}_${member.userId}`)
    const existing = existingByUserId.get(member.userId)
    const currentData = existing?.data() as Record<string, unknown> | undefined
    batch.set(
      ref,
      {
        channelId,
        userId: member.userId,
        userName: member.userName,
        role: 'member',
        joinedAt: Number(currentData?.joinedAt || now),
        unreadCount: Number(currentData?.unreadCount || 0),
        muted: Boolean(currentData?.muted),
        hidden: Boolean(currentData?.hidden),
      },
      { merge: true }
    )
  }

  for (const doc of existingMembersSnap.docs) {
    const data = doc.data() as Record<string, unknown>
    const userId = String(data.userId || '')
    if (!userId || nextMemberIds.has(userId)) continue
    batch.delete(doc.ref)
  }

  await batch.commit()

  rooms[roomIndex] = {
    ...room,
    opsChannelId: channelId,
    opsChannelName: roomName,
    opsChannelSource: 'projects',
    opsSyncedAt: now,
  }

  return {
    room: rooms[roomIndex],
    rooms,
    channelId,
  }
}
