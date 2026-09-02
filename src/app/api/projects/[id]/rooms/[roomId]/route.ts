export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { canAccessBlockRoom, canAccessGeneralRoom } from '@/lib/projectRoomAccess'
import { buildAutoGeneralRoom, buildGeneralRoomId } from '@/lib/projectGeneralRoom'
import { sessionToRoomAccessUser } from '@/lib/projectAccess'
import {
  syncProjectRoomOpsChannel,
  type ProjectBlockLike,
  type ProjectRoomLike,
} from '@/lib/projectRoomOps'
import {
  collectRemovedProjectAssignmentTargets,
  resolveProjectOwnerTransition,
} from '@/lib/projects/ownerTransition'
import {
  createTaskDeadlineCalendarEvent,
  deleteOutlookCalendarEvent,
  sendOutlookTextMail,
  sendTaskAssignmentEmail,
} from '@/services/graph/calendar'
import { incrementUserUnreadCount } from '@/lib/notifications/unreadCounts'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { collectOutlookRefPatches } from '@/lib/projects/outlookRefPatches'
import { persistProjectOutlookRefPatches } from '@/lib/projects/persistOutlookRefPatches'
import type { DocumentReference } from 'firebase-admin/firestore'

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

const trimText = (value: unknown) => String(value || '').trim()

const equalText = (left: unknown, right: unknown) =>
  normalizeText(String(left || '')) === normalizeText(String(right || ''))

async function sendProjectOwnerUpdateEmail(params: {
  senderEmail?: string
  recipientEmail?: string
  recipientName?: string
  subject: string
  lines: string[]
}) {
  const senderEmail = trimText(params.senderEmail)
  const recipientEmail = trimText(params.recipientEmail)
  if (!senderEmail || !recipientEmail) return

  await sendOutlookTextMail({
    organizerEmail: senderEmail,
    toRecipients: [{ email: recipientEmail, name: trimText(params.recipientName) || recipientEmail }],
    subject: params.subject,
    bodyText: params.lines.filter(Boolean).join('\n\n'),
  })
}

async function notifyTaskOwnerRemoval(params: {
  userId: string
  userName?: string
  userEmail?: string
  senderEmail?: string
  projectId: string
  projectName: string
  blockId: string
  blockName: string
  taskId: string
  taskName: string
  eventId?: string
}) {
  const taskPath = `/menu/projects/${params.projectId}?tab=tasks&blockId=${encodeURIComponent(params.blockId)}&taskId=${encodeURIComponent(params.taskId)}`
  const title = "Ja no ets responsable d'una tasca"
  const body = `La tasca ${params.taskName || 'Tasca'} ja no et te assignat/da com a responsable.`
  const now = Date.now()

  await db.collection('users').doc(params.userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: 'project_task_unassignment',
    projectId: params.projectId,
    blockId: params.blockId,
    taskId: params.taskId,
    projectName: params.projectName,
    blockName: params.blockName,
    taskName: params.taskName,
  })
  await incrementUserUnreadCount(params.userId, 'project_task_unassignment', 1)
  await sendPushToUsers([params.userId], { title, body, url: taskPath })

  if (trimText(params.userEmail) && trimText(params.senderEmail)) {
    await sendProjectOwnerUpdateEmail({
      senderEmail: params.senderEmail,
      recipientEmail: params.userEmail,
      recipientName: params.userName,
      subject: `Desassignacio de tasca - ${params.taskName || 'Tasca'} - ${params.projectName}`,
      lines: [
        `Ja no ets la persona responsable de la tasca ${params.taskName || 'Tasca'}.`,
        `Projecte: ${params.projectName}`,
        `Bloc: ${params.blockName}`,
      ],
    })
  }

  if (trimText(params.userEmail) && trimText(params.eventId)) {
    try {
      await deleteOutlookCalendarEvent(trimText(params.userEmail), trimText(params.eventId))
    } catch (err) {
      console.error('[project-room] task removal calendar error', err)
    }
  }
}

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
  eventId?: string
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
    eventId,
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
  const taskPath = `/menu/projects/${projectId}?tab=tasks&blockId=${encodeURIComponent(blockId)}&taskId=${encodeURIComponent(taskId)}`
  const taskUrl = `${String(baseUrl || '').replace(/\/$/, '')}${taskPath}`
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
  await incrementUserUnreadCount(userId, 'project_task_assignment', 1)

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
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

  await sendPushToUsers([userId], {
    title,
    body,
    url: taskPath,
  })

  if (!userEmail) return null

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
      url: taskUrl,
    })
  } catch (err) {
    console.error('[project-room] task assignment email error', err)
  }

  if (!deadline) return null

  try {
    const event = await createTaskDeadlineCalendarEvent({
      assigneeEmail: userEmail,
      eventId,
      projectName,
      blockName,
      taskName,
      deadline,
      url: taskUrl,
    })
    return {
      outlookEventId: event.id,
      outlookEventWebLink: event.webLink,
      outlookEventEmail: userEmail,
    }
  } catch (err) {
    console.error('[project-room] task assignment calendar error', err)
  }

  return null
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

type SessionResult = { error: NextResponse } | { user: SessionUser }

async function requireSession(): Promise<SessionResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user: session.user as SessionUser }
}

function resolveRoomContext(data: Record<string, unknown>, roomId: string, projectId: string) {
  const rooms = Array.isArray(data.rooms) ? [...(data.rooms as ProjectRoomLike[])] : []
  let room = rooms.find((item) => String(item.id || '') === roomId) || null

  if (!room) {
    room =
      buildAutoGeneralRoom({ ...data, id: projectId }, projectId, roomId) ||
      buildAutoRoomFromBlock(data, roomId)
  }

  if (!room) {
    return { room: null, block: null, rooms }
  }

  if (roomId === buildGeneralRoomId(projectId)) {
    room = { ...room, kind: 'general', blockId: '' }
  }

  const blockId = String(room.blockId || '')
  const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : []
  const block = blocks.find((item) => String(item.id || '') === blockId) || null

  return { room, block, rooms }
}

function canAccessProjectRoom(
  user: SessionUser,
  data: Record<string, unknown>,
  room: ProjectRoomLike,
  block: Record<string, unknown> | null,
  projectId: string,
  roomId: string
) {
  const project = {
    owner: String(data.owner || ''),
    ownerUserId: String(data.ownerUserId || ''),
    sponsor: String(data.sponsor || ''),
    createdById: String(data.createdById || ''),
  }

  const blockForAccess = block
    ? {
        owner: String(block.owner || ''),
        tasks: (Array.isArray(block.tasks) ? block.tasks : []).map((task) => ({
          owner: String((task as Record<string, unknown>).owner || ''),
        })),
      }
    : null

  const roomForAccess = {
    participants: Array.isArray(room.participants)
      ? (room.participants as unknown[]).map(String)
      : [],
    kind: String(room.kind || ''),
  }

  const accessUser = sessionToRoomAccessUser(user)

  if (roomId === buildGeneralRoomId(projectId) || String(room.kind || '') === 'general') {
    const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : []
    return canAccessGeneralRoom(
      accessUser,
      project,
      blocks.map((item) => ({ owner: String(item.owner || '') })),
      roomForAccess
    )
  }

  return canAccessBlockRoom(accessUser, project, blockForAccess, roomForAccess)
}

type RoomAccessSuccess = {
  user: SessionUser
  data: Record<string, unknown>
  room: ProjectRoomLike
  block: Record<string, unknown> | null
  rooms: ProjectRoomLike[]
  projectRef: DocumentReference
}

type RoomAccessResult = { error: NextResponse } | RoomAccessSuccess

function isRoomAccessError(value: RoomAccessResult): value is { error: NextResponse } {
  return 'error' in value
}

async function requireRoomAccess(projectId: string, roomId: string): Promise<RoomAccessResult> {
  const session = await requireSession()
  if ('error' in session) {
    return { error: session.error }
  }

  const { user } = session
  const projectRef = db.collection('projects').doc(projectId)
  const snap = await projectRef.get()
  if (!snap.exists) {
    return { error: NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 }) }
  }

  const data = snap.data() as Record<string, unknown>
  const { room, block, rooms } = resolveRoomContext(data, roomId, projectId)

  if (!room) {
    return { error: NextResponse.json({ error: 'Sala no trobada' }, { status: 404 }) }
  }

  if (!canAccessProjectRoom(user, data, room, block, projectId, roomId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const workingRooms = [...rooms]
  if (!workingRooms.some((item) => String(item.id || '') === roomId)) {
    workingRooms.push(room)
  }

  return { user, data, room, block, rooms: workingRooms, projectRef }
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
  try {
    const { id, roomId } = await params
    const auth = await requireRoomAccess(id, roomId)
    if (isRoomAccessError(auth)) return auth.error

    const { data, room, block: linkedBlock } = auth

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
        // Privacy-scoped snapshot: never the full project. Callers must not
        // PATCH /api/projects/[id] with these arrays (replace-merge wipe).
        blocks: linkedBlock ? [linkedBlock] : [],
        rooms: [room],
        document: data.document ?? null,
        documents: Array.isArray(data.documents) ? data.documents : [],
        kickoff:
          data.kickoff && typeof data.kickoff === 'object'
            ? data.kickoff
            : EMPTY_KICKOFF,
      },
      users: [],
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
  try {
    const { id, roomId } = await params
    const auth = await requireRoomAccess(id, roomId)
    if (isRoomAccessError(auth)) return auth.error

    const baseUrl = new URL(req.url).origin
    const payload = (await req.json()) as {
      room?: Record<string, unknown>
      tasks?: Array<Record<string, unknown>>
    }

    const { data, rooms, projectRef } = auth
    const roomIndex = rooms.findIndex((room) => String(room.id || '') === roomId)

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
        const nextTasks = payload.tasks.map((task) => ({ ...task }))
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

        taskAssignmentNotifications = nextTasks.map(async (task) => {
          const taskId = trimText(task?.id)
          const taskName = trimText(task?.title) || 'Tasca'
          const taskOwner = trimText(task?.owner)
          const deadline = trimText(task?.deadline)
          const previousTask = previousTasksById.get(taskId)
          const previousOwnerName = trimText(previousTask?.owner)
          const { shouldNotifyRemoval, shouldNotifyAssignment } = resolveProjectOwnerTransition({
            previousOwnerName,
            nextOwnerName: taskOwner,
          })

          if (!taskId || (!shouldNotifyRemoval && !shouldNotifyAssignment)) return null

          if (shouldNotifyRemoval) {
            const previousOwnerUser = await findUserByName(previousOwnerName)
            if (previousOwnerUser?.id) {
              await notifyTaskOwnerRemoval({
                userId: previousOwnerUser.id,
                userName: trimText(previousOwnerUser.name) || previousOwnerName,
                userEmail: trimText(previousOwnerUser.email),
                senderEmail,
                projectId: id,
                projectName,
                blockId,
                blockName,
                taskId,
                taskName: trimText(previousTask?.title) || taskName,
                eventId:
                  equalText(previousTask?.outlookEventEmail, previousOwnerUser.email)
                    ? trimText(previousTask?.outlookEventId)
                    : '',
              })
            }
          }

          if (!shouldNotifyAssignment) return null

          const assignedUser = await findUserByName(taskOwner)
          if (!assignedUser?.id) return null

          const eventRef = await notifyTaskOwnerAssignment({
            userId: assignedUser.id,
            userName: trimText(assignedUser.name) || taskOwner,
            userEmail: trimText(assignedUser.email),
            eventId:
              equalText(task.outlookEventEmail, assignedUser.email) ? trimText(task.outlookEventId) : '',
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

          if (eventRef) {
            task.outlookEventId = eventRef.outlookEventId
            task.outlookEventWebLink = eventRef.outlookEventWebLink
            task.outlookEventEmail = eventRef.outlookEventEmail
          }

          return null
        })

        taskAssignmentNotifications.push(
          ...nextTasks.map(async (task) => {
            const taskId = trimText(task?.id)
            const taskName = trimText(task?.title) || 'Tasca'
            const taskOwner = trimText(task?.owner)
            const deadline = trimText(task?.deadline)
            const previousTask = previousTasksById.get(taskId)
            const previousOwnerName = trimText(previousTask?.owner)
            const previousTaskName = trimText(previousTask?.title) || 'Tasca'
            const previousDeadline = trimText(previousTask?.deadline)

            if (!taskId || !taskOwner || !previousTask || !equalText(taskOwner, previousOwnerName)) return null

            const deadlineChanged = deadline !== previousDeadline
            const nameChanged = !equalText(taskName, previousTaskName)
            if (!deadlineChanged && !nameChanged) return null

            const assignedUser = await findUserByName(taskOwner)
            const recipientEmail = trimText(assignedUser?.email)
            const recipientId = trimText(assignedUser?.id)
            const taskPath = `/menu/projects/${id}?tab=tasks&blockId=${encodeURIComponent(blockId)}&taskId=${encodeURIComponent(taskId)}`
            const taskUrl = `${String(baseUrl || '').replace(/\/$/, '')}${taskPath}`

            if (recipientId) {
              const title = "S'ha actualitzat una tasca teva"
              const body = `S'han actualitzat dades de la tasca ${taskName}.`
              const now = Date.now()
              await db.collection('users').doc(recipientId).collection('notifications').add({
                title,
                body,
                createdAt: now,
                read: false,
                type: 'project_task_update',
                projectId: id,
                blockId,
                taskId,
                projectName,
                blockName,
                taskName,
              })
              await incrementUserUnreadCount(recipientId, 'project_task_update', 1)
              await sendPushToUsers([recipientId], { title, body, url: taskPath })
            }

            if (recipientEmail && senderEmail) {
              await sendProjectOwnerUpdateEmail({
                senderEmail,
                recipientEmail,
                recipientName: trimText(assignedUser?.name) || taskOwner,
                subject: `Actualitzacio de tasca - ${taskName} - ${projectName}`,
                lines: [
                  `S'ha actualitzat la tasca ${taskName}.`,
                  `Projecte: ${projectName}`,
                  `Bloc: ${blockName}`,
                  deadlineChanged ? `Nova data limit: ${deadline || 'Sense data'}` : '',
                  nameChanged ? `Nom actual: ${taskName}` : '',
                  `Obrir tasca: ${taskUrl}`,
                ],
              })
            }

            const currentTaskEventId = trimText(task.outlookEventId)
            const canReuseTaskEvent = equalText(task.outlookEventEmail, recipientEmail) && currentTaskEventId

            if (recipientEmail) {
              if (!deadline && canReuseTaskEvent) {
                await deleteOutlookCalendarEvent(recipientEmail, currentTaskEventId)
                task.outlookEventId = ''
                task.outlookEventWebLink = ''
                task.outlookEventEmail = ''
                return null
              }

              if (deadline) {
                const event = await createTaskDeadlineCalendarEvent({
                  assigneeEmail: recipientEmail,
                  eventId: canReuseTaskEvent ? currentTaskEventId : '',
                  projectName,
                  blockName,
                  taskName,
                  deadline,
                  url: taskUrl,
                })
                task.outlookEventId = event.id
                task.outlookEventWebLink = event.webLink
                task.outlookEventEmail = recipientEmail
              }
            }

            return null
          })
        )

        taskAssignmentNotifications.push(
          ...collectRemovedProjectAssignmentTargets({
            previousBlocks: [previousBlock],
            nextBlocks: [{ ...previousBlock, id: blockId, tasks: nextTasks }],
          }).map(async (target) => {
            const previousOwnerUser = await findUserByName(target.previousOwnerName)
            if (!previousOwnerUser?.id) return null

            return notifyTaskOwnerRemoval({
              userId: previousOwnerUser.id,
              userName: trimText(previousOwnerUser.name) || target.previousOwnerName,
              userEmail: trimText(previousOwnerUser.email),
              senderEmail,
              projectId: id,
              projectName,
              blockId: target.blockId,
              blockName: target.blockName,
              taskId: target.taskId,
              taskName: target.taskName,
              eventId: equalText(target.outlookEventEmail, previousOwnerUser.email)
                ? target.outlookEventId
                : '',
            })
          })
        )

        blocks[blockIndex] = {
          ...blocks[blockIndex],
          tasks: nextTasks,
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

    if (Array.isArray(nextPayload.blocks)) {
      await persistProjectOutlookRefPatches(
        id,
        collectOutlookRefPatches(data.blocks, nextPayload.blocks)
      )
    }

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
  try {
    const { id, roomId } = await params
    const auth = await requireRoomAccess(id, roomId)
    if (isRoomAccessError(auth)) return auth.error

    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'Arxiu invalid' }, { status: 400 })
    }

    const { data, rooms, projectRef } = auth
    const roomIndex = rooms.findIndex((room) => String(room.id || '') === roomId)

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
  try {
    const { id, roomId } = await params
    const auth = await requireRoomAccess(id, roomId)
    if (isRoomAccessError(auth)) return auth.error

    const { data, rooms, projectRef } = auth

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
