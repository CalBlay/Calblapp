export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { canAccessProjects } from '@/lib/projectAccess'
import { syncProjectRoomOpsChannel, type ProjectBlockLike, type ProjectRoomLike } from '@/lib/projectRoomOps'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
}

const buildAutoRoomFromBlock = (data: Record<string, unknown>, roomId: string) => {
  if (!roomId.startsWith('room-block-')) return null

  const blockId = roomId.replace('room-block-', '')
  const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : []
  const block = blocks.find((item) => String(item.id || '') === blockId)
  if (!block) return null

  const tasks = Array.isArray(block.tasks) ? (block.tasks as Record<string, unknown>[]) : []
  const participants = [...new Set([
    String(data.owner || ''),
    String(block.owner || ''),
    ...tasks.map((task) => String(task.owner || '')),
  ].filter(Boolean))]
  const departments = Array.isArray(block.departments)
    ? (block.departments as unknown[]).map(String).filter(Boolean)
    : [String(block.department || '')].filter(Boolean)

  return {
    id: roomId,
    name: String(block.name || departments[0] || block.department || 'Sala de bloc'),
    kind: 'block' as const,
    blockId,
    opsChannelId: '',
    opsChannelName: '',
    opsChannelSource: 'projects' as const,
    opsSyncedAt: 0,
    departments,
    participants,
    participantDetails: participants.map((name) => ({ name })),
    notes: '',
    documents: [],
    messages: [],
  }
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = session.user as SessionUser
  if (!canAccessProjects(user)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { roomIds?: string[] }
    const requestedRoomIds = Array.isArray(body.roomIds)
      ? body.roomIds.map(String).filter(Boolean)
      : []

    const projectRef = db.collection('projects').doc(id)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const initialRooms = Array.isArray(data.rooms) ? [...(data.rooms as ProjectRoomLike[])] : []
    const roomsToSync = requestedRoomIds.length > 0
      ? requestedRoomIds
      : initialRooms.map((room) => String(room.id || '')).filter(Boolean)

    let workingRooms = initialRooms
    for (const roomId of roomsToSync) {
      if (!workingRooms.some((room) => String(room.id || '') === roomId)) {
        const autoRoom = buildAutoRoomFromBlock({ ...data, rooms: workingRooms }, roomId)
        if (autoRoom) {
          workingRooms = [...workingRooms, autoRoom]
        }
      }
    }

    const project = {
      id,
      name: String(data.name || ''),
      owner: String(data.owner || ''),
      rooms: workingRooms,
      blocks: Array.isArray(data.blocks) ? (data.blocks as ProjectBlockLike[]) : [],
    }

    const syncedRoomsById = new Map<string, Record<string, unknown>>()
    for (const roomId of roomsToSync) {
      const syncResult = await syncProjectRoomOpsChannel({
        project: {
          ...project,
          rooms: workingRooms,
        },
        roomId,
      })
      workingRooms = syncResult.rooms as ProjectRoomLike[]
      syncedRoomsById.set(roomId, syncResult.room as ProjectRoomLike)
    }

    await projectRef.set(
      {
        rooms: workingRooms,
        updatedAt: Date.now(),
        updatedById: auth.user.id,
        updatedByName: auth.user.name || '',
      },
      { merge: true }
    )

    return NextResponse.json({
      rooms: workingRooms,
      syncedRooms: Array.from(syncedRoomsById.values()),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
