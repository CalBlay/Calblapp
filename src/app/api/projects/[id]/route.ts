export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { after, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { canAccessProjects } from '@/lib/projectAccess'
import { deriveProjectPhase } from '@/app/menu/projects/components/project-shared'
import { archiveProjectRoomOpsChannel } from '@/lib/projectRoomOps'
import {
  createBlockDeadlineCalendarEvent,
  createTaskDeadlineCalendarEvent,
  sendBlockAssignmentEmail,
  sendTaskAssignmentEmail,
} from '@/services/graph/calendar'
import Ably from 'ably'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
}

const normalizeComparableText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const clean = (value: FormDataEntryValue | null) => String(value || '').trim()
const normLower = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
const hasLaunchWindowExpired = (value?: string) => {
  const raw = String(value || '').trim()
  if (!raw) return false
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() >= date.getTime() + 24 * 60 * 60 * 1000
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

async function deleteDocsInChunks(
  refs: Array<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>>
) {
  const chunkSize = 400
  for (let index = 0; index < refs.length; index += chunkSize) {
    const batch = db.batch()
    refs.slice(index, index + chunkSize).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

async function uploadDocument(file: File, projectId: string) {
  const bytes = Buffer.from(await file.arrayBuffer())
  const fileName = file.name || `document-${Date.now()}`
  const path = `projects/${projectId}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`

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
    name: file.name || '',
    path,
    url,
    size: file.size,
    type: file.type || 'application/octet-stream',
  }
}

const buildStoredDocument = async (params: {
  file: File
  projectId: string
  category?: string
  label?: string
}) => {
  const uploaded = await uploadDocument(params.file, params.projectId)
  return {
    id: `doc-${Date.now()}`,
    category: params.category || 'general',
    label: params.label || uploaded.name || 'Document',
    ...uploaded,
  }
}

async function findUserByName(rawName: string) {
  const name = rawName.trim()
  if (!name) return null

  let snap = await db.collection('users').where('name', '==', name).limit(1).get()
  if (snap.empty) {
    snap = await db.collection('users').where('nameFold', '==', normLower(name)).limit(1).get()
  }

  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) }
}

async function findUserById(userId: string) {
  const id = String(userId || '').trim()
  if (!id) return null
  const doc = await db.collection('users').doc(id).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) }
}

function createUserResolver() {
  const byId = new Map<string, Promise<Record<string, unknown> | null>>()
  const byName = new Map<string, Promise<Record<string, unknown> | null>>()

  return {
    findById(userId: string) {
      const id = String(userId || '').trim()
      if (!id) return Promise.resolve(null)
      if (!byId.has(id)) {
        byId.set(id, findUserById(id))
      }
      return byId.get(id)!
    },
    findByName(rawName: string) {
      const name = String(rawName || '').trim()
      if (!name) return Promise.resolve(null)
      const key = normLower(name)
      if (!byName.has(key)) {
        byName.set(key, findUserByName(name))
      }
      return byName.get(key)!
    },
  }
}

async function notifyProjectOwner(params: {
  userId: string
  projectId: string
  projectName: string
  baseUrl: string
}) {
  const { userId, projectId, projectName, baseUrl } = params
  const title = "T'han assignat un projecte"
  const body = `Ara ets responsable del projecte: ${projectName || 'Projecte'}`
  const now = Date.now()

  await db.collection('users').doc(userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: 'project_assignment',
    projectId,
    projectName,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const rest = new Ably.Rest({ key: apiKey })
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: 'project_assignment',
        projectId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[projects] Ably publish error', err)
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
        url: `/menu/projects/${projectId}`,
      }),
    })
  } catch (err) {
    console.error('[projects] push error', err)
  }
}

async function notifyBlockOwnerAssignment(params: {
  userId: string
  userName: string
  userEmail?: string
  projectId: string
  projectName: string
  blockId: string
  blockName: string
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
    deadline,
    baseUrl,
    senderEmail,
  } = params
  const title = "T'han assignat un bloc"
  const body = `Ara ets responsable del bloc ${blockName || 'Bloc'} del projecte ${projectName || 'Projecte'}`
  const now = Date.now()

  await db.collection('users').doc(userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: 'project_block_assignment',
    projectId,
    blockId,
    projectName,
    blockName,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const rest = new Ably.Rest({ key: apiKey })
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: 'project_block_assignment',
        projectId,
        blockId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[projects] block assignment Ably publish error', err)
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
        url: `/menu/projects/${projectId}?tab=blocks`,
      }),
    })
  } catch (err) {
    console.error('[projects] block assignment push error', err)
  }

  if (!userEmail) return

  try {
    await sendBlockAssignmentEmail({
      senderEmail: senderEmail || userEmail,
      recipient: {
        email: userEmail,
        name: userName,
      },
      projectName,
      blockName,
      deadline,
    })
  } catch (err) {
    console.error('[projects] block assignment email error', err)
  }

  if (!deadline) return

  try {
    await createBlockDeadlineCalendarEvent({
      assigneeEmail: userEmail,
      projectName,
      blockName,
      deadline,
    })
  } catch (err) {
    console.error('[projects] block assignment calendar error', err)
  }
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
      console.error('[projects] task assignment Ably publish error', err)
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
    console.error('[projects] task assignment push error', err)
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
    console.error('[projects] task assignment email error', err)
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
    console.error('[projects] task assignment calendar error', err)
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id } = await params
    const snap = await db.collection('projects').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ id: snap.id, ...(snap.data() as Record<string, unknown>) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id } = await params
    const docRef = db.collection('projects').doc(id)
    const snap = await docRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const userRole = normalizeComparableText(auth.user.role)
    const userName = normalizeComparableText(auth.user.name)
    const createdById = String(data.createdById || '').trim()
    const sponsor = normalizeComparableText(String(data.sponsor || ''))
    const canDelete =
      userRole === 'admin' ||
      (auth.user.id && auth.user.id === createdById) ||
      (userName && sponsor && userName === sponsor)

    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const bucket = storageAdmin.bucket()
    const channelsSnap = await db
      .collection('channels')
      .where('source', '==', 'projects')
      .where('projectId', '==', id)
      .get()
    const channelIds = channelsSnap.docs.map((doc) => doc.id)

    const channelMembersRefs = channelIds.length
      ? (
          await Promise.all(
            channelIds.map((channelId) =>
              db.collection('channelMembers').where('channelId', '==', channelId).get()
            )
          )
        ).flatMap((snap) => snap.docs.map((doc) => doc.ref))
      : []

    const messageDocs = channelIds.length
      ? (
          await Promise.all(
            channelIds.map((channelId) =>
              db.collection('messages').where('channelId', '==', channelId).get()
            )
          )
        ).flatMap((snap) => snap.docs)
      : []
    const messageRefs = messageDocs.map((doc) => doc.ref)

    const messageReadRefs = messageDocs.flatMap((doc) => {
      const messageId = doc.id
      return channelMembersRefs.map((memberRef) => {
        const memberId = memberRef.id
        const userId = memberId.split('_').slice(1).join('_')
        return db.collection('messageReads').doc(`${messageId}_${userId}`)
      })
    })

    const userNotificationsRefs = (
      await Promise.all(
        (
          await db.collection('users').get()
        ).docs.map((userDoc) =>
          userDoc.ref.collection('notifications').where('projectId', '==', id).get()
        )
      )
    ).flatMap((snap) => snap.docs.map((doc) => doc.ref))

    await deleteDocsInChunks([
      ...messageReadRefs,
      ...messageRefs,
      ...channelMembersRefs,
      ...channelsSnap.docs.map((doc) => doc.ref),
      ...userNotificationsRefs,
      docRef,
    ])

    try {
      await bucket.deleteFiles({ prefix: `projects/${id}/` })
    } catch {
      // ignore storage cleanup errors
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const userResolver = createUserResolver()
    const { id } = await params
    const baseUrl = new URL(req.url).origin
    const form = await req.formData()
    const currentSnap = await db.collection('projects').doc(id).get()
    const currentData = currentSnap.exists ? (currentSnap.data() as Record<string, unknown>) : {}
    const file = form.get('file')
    const currentDocuments = Array.isArray(currentData.documents)
      ? (currentData.documents as Record<string, unknown>[])
      : []
    const currentRooms = Array.isArray(currentData.rooms)
      ? (currentData.rooms as Record<string, unknown>[])
      : []
    const currentBlocks = Array.isArray(currentData.blocks)
      ? (currentData.blocks as Record<string, unknown>[])
      : []
    const fileCategory = clean(form.get('fileCategory')) || 'general'
    const fileLabel = clean(form.get('fileLabel'))
    const document =
      file instanceof File && file.size > 0
        ? await buildStoredDocument({
            file,
            projectId: id,
            category: fileCategory,
            label: fileLabel || (fileCategory === 'initial' ? 'Document inicial' : ''),
          })
        : undefined
    const hasOwnerField = form.get('owner') !== null
    const owner = hasOwnerField ? clean(form.get('owner')) : String(currentData.owner || '')
    const previousOwnerUserId = String(currentData.ownerUserId || '')
    const previousOwner = String(currentData.owner || '')
    const hasOwnerInputChanged = owner !== previousOwner
    const ownerUser =
      hasOwnerField && hasOwnerInputChanged && owner ? await userResolver.findByName(owner) : null

    const payload: Record<string, unknown> = {
      phase: clean(form.get('phase')) || String(currentData.phase || 'definition'),
      status: form.get('status') !== null ? clean(form.get('status')) : String(currentData.status || ''),
      updatedAt: Date.now(),
      updatedById: auth.user.id,
      updatedByName: auth.user.name || '',
    }

    if (form.get('name') !== null) payload.name = clean(form.get('name'))
    if (form.get('sponsor') !== null) payload.sponsor = clean(form.get('sponsor'))
    if (hasOwnerField) {
      payload.owner = owner
      payload.ownerUserId = owner
        ? hasOwnerInputChanged
          ? ownerUser?.id || ''
          : previousOwnerUserId
        : previousOwnerUserId
    }
    if (form.get('context') !== null) payload.context = clean(form.get('context'))
    if (form.get('strategy') !== null) payload.strategy = clean(form.get('strategy'))
    if (form.get('risks') !== null) payload.risks = clean(form.get('risks'))
    if (form.get('startDate') !== null) payload.startDate = clean(form.get('startDate'))
    if (form.get('launchDate') !== null) payload.launchDate = clean(form.get('launchDate'))
    if (form.get('budget') !== null) payload.budget = clean(form.get('budget'))

    const departmentsRaw = form.get('departments')
    if (departmentsRaw !== null) {
      try {
        payload.departments = JSON.parse(String(departmentsRaw))
      } catch {
        payload.departments = []
      }
    }

    const blocksRaw = form.get('blocks')
    if (blocksRaw !== null) {
      try {
        payload.blocks = JSON.parse(String(blocksRaw))
      } catch {
        payload.blocks = []
      }
    }

    const roomsRaw = form.get('rooms')
    if (roomsRaw !== null) {
      try {
        payload.rooms = JSON.parse(String(roomsRaw))
      } catch {
        payload.rooms = Array.isArray(currentData.rooms) ? currentData.rooms : []
      }
    }

    const documentsRaw = form.get('documents')
    if (documentsRaw !== null) {
      try {
        payload.documents = JSON.parse(String(documentsRaw))
      } catch {
        payload.documents = currentDocuments
      }
    }

    const baseDocuments = Array.isArray(payload.documents)
      ? (payload.documents as Record<string, unknown>[])
      : currentDocuments

    if (document) {
      payload.documents = [...baseDocuments, document]
      if (document.category === 'initial') {
        payload.document = document
      }
    } else if (!Array.isArray(payload.documents)) {
      payload.documents = baseDocuments
    } else {
      const nextInitialDocument =
        baseDocuments.find((item) => String(item?.category || '') === 'initial') || null
      payload.document = nextInitialDocument
    }

    const kickoffRaw = form.get('kickoff')
    if (kickoffRaw !== null) {
      try {
        payload.kickoff = JSON.parse(String(kickoffRaw))
      } catch {
        payload.kickoff = null
      }
    }

    payload.phase = deriveProjectPhase({
      launchDate: String(payload.launchDate ?? currentData.launchDate ?? ''),
      kickoff: (payload.kickoff ?? currentData.kickoff ?? null) as Record<string, unknown> | null,
      blocks: (Array.isArray(payload.blocks) ? payload.blocks : currentData.blocks || []) as Array<Record<string, unknown>>,
    })

    const nextRooms = Array.isArray(payload.rooms)
      ? (payload.rooms as Record<string, unknown>[])
      : currentRooms
    const nextBlocks = Array.isArray(payload.blocks)
      ? (payload.blocks as Record<string, unknown>[])
      : currentBlocks
    const nextRoomIds = new Set(nextRooms.map((room) => String(room.id || '')).filter(Boolean))
    const currentRoomIds = new Set(currentRooms.map((room) => String(room.id || '')).filter(Boolean))
    const removedManualRooms = currentRooms.filter((room) => {
      const roomId = String(room.id || '')
      if (!roomId || nextRoomIds.has(roomId)) return false
      return String(room.kind || '') === 'manual'
    })
    const addedRooms = nextRooms.filter((room) => {
      const roomId = String(room.id || '')
      return Boolean(roomId) && !currentRoomIds.has(roomId)
    })
    const previousLaunchExpired = hasLaunchWindowExpired(String(currentData.launchDate || ''))
    const nextLaunchExpired = hasLaunchWindowExpired(String(payload.launchDate ?? currentData.launchDate ?? ''))
    const previousWasDraft = String(currentData.status || '').trim() === 'draft'
    const nextIsDraft = String(payload.status ?? currentData.status ?? '').trim() === 'draft'

    await db.collection('projects').doc(id).set(payload, { merge: true })

    const archiveTargets =
      nextLaunchExpired && !previousLaunchExpired
        ? nextRooms
        : nextLaunchExpired
          ? addedRooms
          : []

    const ownerUserForNotification =
      ownerUser || (!nextIsDraft && owner ? await userResolver.findByName(owner) : null)
    const hasOwnerChanged =
      !nextIsDraft &&
      Boolean(ownerUserForNotification?.id) &&
      (previousWasDraft || ownerUserForNotification!.id !== previousOwnerUserId || owner !== previousOwner)
    const currentBlocksById = new Map(
      currentBlocks.map((block) => [String(block.id || ''), block] as const).filter(([id]) => Boolean(id))
    )
    const projectName = String(payload.name || currentData.name || '')

    after(async () => {
      const actorUser = await userResolver.findById(auth.user.id)
      const senderEmail = String(actorUser?.email || '').trim()

      const blockAssignmentNotifications = nextBlocks.map(async (block) => {
        const blockId = String(block.id || '').trim()
        const blockName = String(block.name || '').trim()
        const blockOwner = String(block.owner || '').trim()
        const deadline = String(block.deadline || '').trim()
        const previousBlock = currentBlocksById.get(blockId)
        const previousOwnerName = previousWasDraft ? '' : String(previousBlock?.owner || '').trim()

        if (!blockId || !blockOwner || blockOwner === previousOwnerName) return null

        const assignedUser = await userResolver.findByName(blockOwner)
        if (!assignedUser?.id) return null

        return notifyBlockOwnerAssignment({
          userId: assignedUser.id,
          userName: String(assignedUser.name || blockOwner).trim(),
          userEmail: String(assignedUser.email || '').trim(),
          projectId: id,
          projectName,
          blockId,
          blockName: blockName || 'Bloc',
          deadline,
          baseUrl,
          senderEmail,
        })
      })

      const taskAssignmentNotifications = nextBlocks.flatMap((block) => {
        const blockId = String(block.id || '').trim()
        const blockName = String(block.name || '').trim() || 'Bloc'
        const previousBlock = currentBlocksById.get(blockId)
        const previousTasksById = new Map(
          (Array.isArray(previousBlock?.tasks) ? previousBlock.tasks : [])
            .map((task) => [String(task?.id || ''), task] as const)
            .filter(([taskId]) => Boolean(taskId))
        )

        return (Array.isArray(block.tasks) ? block.tasks : []).map(async (task) => {
          const taskId = String(task?.id || '').trim()
          const taskName = String(task?.title || '').trim() || 'Tasca'
          const taskOwner = String(task?.owner || '').trim()
          const deadline = String(task?.deadline || '').trim()
          const previousTask = previousTasksById.get(taskId)
          const previousOwnerName = previousWasDraft ? '' : String(previousTask?.owner || '').trim()

          if (!taskId || !taskOwner || taskOwner === previousOwnerName) return null

          const assignedUser = await userResolver.findByName(taskOwner)
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
      })

      await Promise.allSettled([
        ...(removedManualRooms.length > 0
          ? removedManualRooms.map((room) =>
              archiveProjectRoomOpsChannel({
                projectId: id,
                roomId: String(room.id || ''),
                room: {
                  opsChannelId: String(room.opsChannelId || ''),
                  name: String(room.name || ''),
                },
              })
            )
          : []),
        ...(archiveTargets.length > 0
          ? archiveTargets.map((room) =>
              archiveProjectRoomOpsChannel({
                projectId: id,
                roomId: String(room.id || ''),
                room: {
                  opsChannelId: String(room.opsChannelId || ''),
                  name: String(room.name || ''),
                },
              })
            )
          : []),
        ...(hasOwnerChanged
          ? [
              notifyProjectOwner({
                userId: ownerUserForNotification!.id,
                projectId: id,
                projectName,
                baseUrl,
              }),
            ]
          : []),
        ...blockAssignmentNotifications,
        ...taskAssignmentNotifications,
      ])
    })

    return NextResponse.json({ id, document })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
