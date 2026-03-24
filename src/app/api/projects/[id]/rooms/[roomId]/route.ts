export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { canAccessProjects } from '@/lib/projectAccess'
import { syncProjectRoomOpsChannel } from '@/lib/projectRoomOps'
import {
  createTaskDeadlineCalendarEvent,
  sendTaskAssignmentEmail,
} from '@/services/graph/calendar'
import Ably from 'ably'
import type { ProjectBlockLike, ProjectRoomLike } from '@/lib/projectRoomOps'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
}

type UserLookup = {
  id: string
  name?: string
  email?: string
}

const EMPTY_KICKOFF = {
  date: '',
  startTime: '',
  durationMinutes: 60,
  notes: '',
  minutes: '',
  minutesStatus: 'open',
  minutesAuthor: '',
  minutesClosedAt: '',
  minutesUpdatedAt: '',
  excludedKeys: [],
  attendees: [],
  status: '',
  graphWebLink: '',
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function findUserByName(rawName: string) {
  const name = rawName.trim()
  if (!name) return null

  let snap = await db.collection('users').where('name', '==', name).limit(1).get()
  if (snap.empty) {
    snap = await db.collection('users').where('nameFold', '==', normalizeText(name)).limit(1).get()
  }

  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) } as UserLookup
}

async function findUserById(userId: string) {
  const id = String(userId || '').trim()
  if (!id) return null
  const doc = await db.collection('users').doc(id).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) } as UserLookup
}

async function notifyTaskOwnerAssignment(params: {
  userId: string
  userName: string
  userEmail?: string
  projectId: string
  projectName: string
  blockId: string
  blockName: string
  taskId: string
  taskName: string
  deadline?: string
  baseUrl: string
  senderEmail?: string
}) {
  const {
    userId,
    userName,
    userEmail,
    projectId,
    projectName,
    blockId,
    blockName,
    taskId,
    taskName,
    deadline,
    baseUrl,
    senderEmail,
  } = params
  const title = "T'han assignat una tasca"
  const body = `Ara ets responsable de la tasca ${taskName || 'Tasca'} del bloc ${blockName || 'Bloc'}`
  const now = Date.now()

  await db.collection('users').doc(userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: 'project_task_assignment',
    projectId,
    blockId,
    taskId,
    projectName,
    blockName,
    taskName,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const rest = new Ably.Rest({ key: apiKey })
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: 'project_task_assignment',
        projectId,
        blockId,
        taskId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[project-room] task assignment Ably publish error', err)
    }
  }

  try {
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title,
        body,
        url: `/menu/projects/${projectId}?tab=tasks`,
      }),
    })
  } catch (err) {
    console.error('[project-room] task assignment push error', err)
  }

  if (!userEmail) return

  try {
    await sendTaskAssignmentEmail({
      senderEmail: senderEmail || userEmail,
      recipient: {
        email: userEmail,
        name: userName,
      },
      projectName,
      blockName,
      taskName,
      deadline,
    })
  } catch (err) {
    console.error('[project-room] task assignment email error', err)
  }

  if (!deadline) return

  try {
    await createTaskDeadlineCalendarEvent({
      assigneeEmail: userEmail,
      projectName,
      blockName,
      taskName,
      deadline,
    })
  } catch (err) {
    console.error('[project-room] task assignment calendar error', err)
  }
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

async function uploadDocument(file: File, projectId: string, roomId: string) {
  const bytes = Buffer.from(await file.arrayBuffer())
  const fileName = file.name || `document-${Date.now()}`
  const path = `projects/${projectId}/rooms/${roomId}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`

  const bucket = storageAdmin.bucket()
  const fileRef = bucket.file(path)
  await fileRef.save(bytes, {
    contentType: file.type || 'application/octet-stream',
    resumable: false,
  })

  const [url] = await fileRef.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
  })

  return {
    id: `room-doc-${Date.now()}`,
    name: file.name || '',
    label: file.name || 'Document de sala',
    category: 'other',
    path,
    url,
    size: file.size,
    type: file.type || 'application/octet-stream',
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id, roomId } = await params
    const projectRef = db.collection('projects').doc(id)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const rooms = Array.isArray(data.rooms) ? [...(data.rooms as ProjectRoomLike[])] : []
    let room = rooms.find((item) => String(item.id || '') === roomId) || null

    if (!room) {
      room = buildAutoRoomFromBlock(data, roomId)
      if (!room) {
        return NextResponse.json({ error: 'Sala no trobada' }, { status: 404 })
      }
      rooms.push(room)
    }

    const blockId = String(room.blockId || '')
    const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : []
    const linkedBlock = blocks.find((item) => String(item.id || '') === blockId) || null
    const roomDepartments = Array.isArray(room.departments) ? room.departments.map(String).filter(Boolean) : []
    const allowedDepartments = new Set(roomDepartments.map(normalizeText))
    const knownNames = new Set([
      String(data.owner || ''),
      String(room.name || ''),
      String(room.blockId || ''),
      String(linkedBlock?.owner || ''),
      ...((Array.isArray(room.participants) ? room.participants : []) as unknown[]).map(String),
      ...((Array.isArray(linkedBlock?.tasks) ? linkedBlock?.tasks : []) as Record<string, unknown>[]).map((task) =>
        String(task.owner || '')
      ),
    ].filter(Boolean))

    const usersSnap = await db.collection('users').get()
    const users = usersSnap.docs
      .map((doc) => {
        const user = doc.data() as Record<string, unknown>
        return {
          id: doc.id,
          name: String(user.name || '').trim(),
          department: String(user.department || '').trim(),
          role: String(user.role || '').trim(),
        }
      })
      .filter((user) => {
        if (!user.name) return false
        if (knownNames.has(user.name)) return true
        if (allowedDepartments.size === 0) return true
        return allowedDepartments.has(normalizeText(user.department))
      })

    return NextResponse.json({
      project: {
        id,
        name: String(data.name || ''),
        sponsor: String(data.sponsor || ''),
        owner: String(data.owner || ''),
        context: String(data.context || ''),
        strategy: String(data.strategy || ''),
        risks: String(data.risks || ''),
        startDate: String(data.startDate || ''),
        launchDate: String(data.launchDate || ''),
        budget: String(data.budget || ''),
        departments: Array.isArray(data.departments) ? (data.departments as string[]) : [],
        phase: String(data.phase || ''),
        status: String(data.status || ''),
        blocks: linkedBlock ? [linkedBlock] : [],
        rooms: [room],
        document: data.document ?? null,
        documents: Array.isArray(data.documents) ? data.documents : [],
        kickoff:
          data.kickoff && typeof data.kickoff === 'object'
            ? data.kickoff
            : EMPTY_KICKOFF,
      },
      users,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id, roomId } = await params
    const baseUrl = new URL(req.url).origin
    const payload = (await req.json()) as {
      room?: Record<string, unknown>
      tasks?: Array<Record<string, unknown>>
    }

    const projectRef = db.collection('projects').doc(id)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const rooms = Array.isArray(data.rooms) ? [...(data.rooms as Record<string, unknown>[])] : []
    let roomIndex = rooms.findIndex((room) => String(room.id || '') === roomId)
    if (roomIndex === -1) {
      const autoRoom = buildAutoRoomFromBlock(data, roomId)
      if (!autoRoom) {
        return NextResponse.json({ error: 'Sala no trobada' }, { status: 404 })
      }
      rooms.push(autoRoom)
      roomIndex = rooms.length - 1
    }

    if (payload.room) {
      rooms[roomIndex] = {
        ...rooms[roomIndex],
        ...payload.room,
      }
    }

    const nextPayload: Record<string, unknown> = {
      rooms,
      updatedAt: Date.now(),
      updatedById: auth.user.id,
      updatedByName: auth.user.name || '',
    }

    let taskAssignmentNotifications: Promise<unknown>[] = []
    if (Array.isArray(payload.tasks) && String(rooms[roomIndex].blockId || '')) {
      const blocks = Array.isArray(data.blocks) ? [...(data.blocks as ProjectBlockLike[])] : []
      const blockIndex = blocks.findIndex(
        (block) => String(block.id || '') === String(rooms[roomIndex].blockId || '')
      )
      if (blockIndex >= 0) {
        const previousBlock = blocks[blockIndex]
        const previousTasksById = new Map(
          (Array.isArray(previousBlock?.tasks) ? previousBlock.tasks : [])
            .map((task) => [String(task?.id || ''), task] as const)
            .filter(([taskId]) => Boolean(taskId))
        )
        const actorUser = await findUserById(auth.user.id)
        const senderEmail = String(actorUser?.email || '').trim()
        const blockId = String(blocks[blockIndex].id || '').trim()
        const blockName = String(blocks[blockIndex].name || '').trim() || 'Bloc'
        const projectName = String(data.name || '').trim()

        taskAssignmentNotifications = payload.tasks.map(async (task) => {
          const taskId = String(task?.id || '').trim()
          const taskName = String(task?.title || '').trim() || 'Tasca'
          const taskOwner = String(task?.owner || '').trim()
          const deadline = String(task?.deadline || '').trim()
          const previousTask = previousTasksById.get(taskId)
          const previousOwnerName = String(previousTask?.owner || '').trim()

          if (!taskId || !taskOwner || taskOwner === previousOwnerName) return null

          const assignedUser = await findUserByName(taskOwner)
          if (!assignedUser?.id) return null

          return notifyTaskOwnerAssignment({
            userId: assignedUser.id,
            userName: String(assignedUser.name || taskOwner).trim(),
            userEmail: String(assignedUser.email || '').trim(),
            projectId: id,
            projectName,
            blockId,
            blockName,
            taskId,
            taskName,
            deadline,
            baseUrl,
            senderEmail,
          })
        })

        blocks[blockIndex] = {
          ...blocks[blockIndex],
          tasks: payload.tasks,
        }
        nextPayload.blocks = blocks
      }
    }

    const syncResult = await syncProjectRoomOpsChannel({
      project: {
        id,
        name: String(data.name || ''),
        owner: String(data.owner || ''),
        rooms,
        blocks: Array.isArray(nextPayload.blocks)
          ? (nextPayload.blocks as ProjectBlockLike[])
          : Array.isArray(data.blocks)
            ? (data.blocks as ProjectBlockLike[])
            : [],
      },
      roomId,
    })

    nextPayload.rooms = syncResult.rooms

    await projectRef.set(nextPayload, { merge: true })
    await Promise.allSettled(taskAssignmentNotifications)

    return NextResponse.json({ ok: true, room: syncResult.room, opsChannelId: syncResult.channelId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id, roomId } = await params
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'Arxiu invalid' }, { status: 400 })
    }

    const projectRef = db.collection('projects').doc(id)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const rooms = Array.isArray(data.rooms) ? [...(data.rooms as ProjectRoomLike[])] : []
    let roomIndex = rooms.findIndex((room) => String(room.id || '') === roomId)
    if (roomIndex === -1) {
      const autoRoom = buildAutoRoomFromBlock(data, roomId)
      if (!autoRoom) {
        return NextResponse.json({ error: 'Sala no trobada' }, { status: 404 })
      }
      rooms.push(autoRoom)
      roomIndex = rooms.length - 1
    }

    const stored = await uploadDocument(file, id, roomId)
    const currentDocs = Array.isArray(rooms[roomIndex].documents)
      ? (rooms[roomIndex].documents as Record<string, unknown>[])
      : []

    rooms[roomIndex] = {
      ...rooms[roomIndex],
      documents: [...currentDocs, stored],
    }

    const synced = await syncProjectRoomOpsChannel({
      project: {
        id,
        name: String(data.name || ''),
        owner: String(data.owner || ''),
        rooms,
        blocks: Array.isArray(data.blocks) ? (data.blocks as ProjectBlockLike[]) : [],
      },
      roomId,
    })

    await projectRef.set(
      {
        rooms: synced.rooms,
        updatedAt: Date.now(),
        updatedById: auth.user.id,
        updatedByName: auth.user.name || '',
      },
      { merge: true }
    )

    return NextResponse.json({ document: stored, room: synced.room, opsChannelId: synced.channelId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  _req: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id, roomId } = await params
    const projectRef = db.collection('projects').doc(id)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const rooms = Array.isArray(data.rooms) ? [...(data.rooms as ProjectRoomLike[])] : []
    let exists = rooms.some((room) => String(room.id || '') === roomId)
    if (!exists) {
      const autoRoom = buildAutoRoomFromBlock(data, roomId)
      if (!autoRoom) {
        return NextResponse.json({ error: 'Sala no trobada' }, { status: 404 })
      }
      rooms.push(autoRoom)
      exists = true
    }
    if (!exists) {
      return NextResponse.json({ error: 'Sala no trobada' }, { status: 404 })
    }

    const synced = await syncProjectRoomOpsChannel({
      project: {
        id,
        name: String(data.name || ''),
        owner: String(data.owner || ''),
        rooms,
        blocks: Array.isArray(data.blocks) ? (data.blocks as ProjectBlockLike[]) : [],
      },
      roomId,
    })

    await projectRef.set(
      {
        rooms: synced.rooms,
        updatedAt: Date.now(),
        updatedById: auth.user.id,
        updatedByName: auth.user.name || '',
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, room: synced.room, opsChannelId: synced.channelId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
