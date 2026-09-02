export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { after, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { canAccessProjects, sessionToAccessUser } from '@/lib/projectAccess'
import {
  userHasGlobalProjectListAccess,
  userParticipatesInProject,
} from '@/lib/projectParticipation'
import {
  applyDependencyLocksToBlocks,
  canChangeTaskStatus,
  deriveBlockStatus,
  deriveProjectPhase,
  getTaskDependencyMeta,
  normalizeTaskWorkflowStatus,
} from '@/app/menu/projects/components/project-shared'
import {
  archiveProjectRoomOpsChannel,
  syncProjectRoomsWithChangedParticipants,
  type ProjectBlockLike,
  type ProjectRoomLike,
} from '@/lib/projectRoomOps'
import {
  collectProjectOutlookCalendarEvents,
  collectRemovedProjectAssignmentTargets,
  resolveProjectOwnerTransition,
} from '@/lib/projects/ownerTransition'
import type { KickoffData, ProjectBlock } from '@/app/menu/projects/components/project-shared'
import {
  createBlockDeadlineCalendarEvent,
  createTaskDeadlineCalendarEvent,
  deleteOutlookCalendarEvent,
  sendBlockAssignmentEmail,
  sendOutlookTextMail,
  sendTaskAssignmentEmail,
} from '@/services/graph/calendar'
import { incrementUserUnreadCount } from '@/lib/notifications/unreadCounts'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { collectOutlookRefPatches } from '@/lib/projects/outlookRefPatches'
import { persistProjectOutlookRefPatches } from '@/lib/projects/persistOutlookRefPatches'

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

const trimText = (value: unknown) => String(value || '').trim()

const equalText = (left: unknown, right: unknown) =>
  normalizeComparableText(String(left || '')) === normalizeComparableText(String(right || ''))

type OutlookRef = {
  outlookEventId?: string
  outlookEventWebLink?: string
  outlookEventEmail?: string
}

type BlockRecord = Record<string, unknown> & {
  tasks?: Array<Record<string, unknown>>
}

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

async function notifyProjectOwnerRemoval(params: {
  userId: string
  userName?: string
  userEmail?: string
  senderEmail?: string
  projectId: string
  projectName: string
  blockId: string
  blockName: string
  taskId?: string
  taskName?: string
  eventId?: string
}) {
  const isTask = Boolean(trimText(params.taskId))
  const url = isTask
    ? `/menu/projects/${params.projectId}?tab=tasks&blockId=${encodeURIComponent(params.blockId)}&taskId=${encodeURIComponent(trimText(params.taskId))}`
    : `/menu/projects/${params.projectId}?tab=blocks&blockId=${encodeURIComponent(params.blockId)}`
  const title = isTask ? "Ja no ets responsable d'una tasca" : "Ja no ets responsable d'un bloc"
  const body = isTask
    ? `La tasca ${trimText(params.taskName) || 'Tasca'} ja no et te assignat/da com a responsable.`
    : `El bloc ${trimText(params.blockName) || 'Bloc'} ja no et te assignat/da com a responsable.`
  const now = Date.now()
  const notificationType = isTask ? 'project_task_unassignment' : 'project_block_unassignment'

  await db.collection('users').doc(params.userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: notificationType,
    projectId: params.projectId,
    blockId: params.blockId,
    taskId: trimText(params.taskId),
    projectName: params.projectName,
    blockName: params.blockName,
    taskName: trimText(params.taskName),
  })
  await incrementUserUnreadCount(params.userId, notificationType, 1)
  await sendPushToUsers([params.userId], { title, body, url })

  if (trimText(params.userEmail) && trimText(params.senderEmail)) {
    await sendProjectOwnerUpdateEmail({
      senderEmail: params.senderEmail,
      recipientEmail: params.userEmail,
      recipientName: params.userName,
      subject: isTask
        ? `Desassignacio de tasca - ${trimText(params.taskName) || 'Tasca'} - ${params.projectName}`
        : `Desassignacio de bloc - ${trimText(params.blockName) || 'Bloc'} - ${params.projectName}`,
      lines: [
        isTask
          ? `Ja no ets la persona responsable de la tasca ${trimText(params.taskName) || 'Tasca'}.`
          : `Ja no ets la persona responsable del bloc ${trimText(params.blockName) || 'Bloc'}.`,
        `Projecte: ${params.projectName}`,
        `Bloc: ${params.blockName}`,
      ],
    })
  }

  const recipientEmail = trimText(params.userEmail)
  const eventId = trimText(params.eventId)
  if (recipientEmail && eventId) {
    try {
      await deleteOutlookCalendarEvent(recipientEmail, eventId)
    } catch (err) {
      console.error('[projects] owner removal calendar error', err)
    }
  }
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = session.user as SessionUser
  if (!canAccessProjects(sessionToAccessUser(user))) {
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
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) } as UserLookup
}

async function findUserById(userId: string) {
  const id = String(userId || '').trim()
  if (!id) return null
  const doc = await db.collection('users').doc(id).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) } as UserLookup
}

function createUserResolver() {
  const byId = new Map<string, Promise<UserLookup | null>>()
  const byName = new Map<string, Promise<UserLookup | null>>()

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
  const { userId, projectId, projectName } = params
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
  await incrementUserUnreadCount(userId, 'project_assignment', 1)

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: 'project_assignment',
        projectId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[projects] Ably publish error', err)
    }
  }

  await sendPushToUsers([userId], {
    title,
    body,
    url: `/menu/projects/${projectId}`,
  })
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
  eventId?: string
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
  const blockPath = `/menu/projects/${projectId}?tab=blocks&blockId=${encodeURIComponent(blockId)}`
  const blockUrl = `${String(baseUrl || '').replace(/\/$/, '')}${blockPath}`
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
  await incrementUserUnreadCount(userId, 'project_block_assignment', 1)

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
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

  await sendPushToUsers([userId], {
    title,
    body,
    url: blockPath,
  })

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
      url: blockUrl,
    })
  } catch (err) {
    console.error('[projects] block assignment email error', err)
  }

  if (!deadline) return

  try {
    const event = await createBlockDeadlineCalendarEvent({
      assigneeEmail: userEmail,
      eventId: trimText(params.eventId),
      projectName,
      blockName,
      deadline,
      url: blockUrl,
    })
    return {
      outlookEventId: event.id,
      outlookEventWebLink: event.webLink,
      outlookEventEmail: userEmail,
    }
  } catch (err) {
    console.error('[projects] block assignment calendar error', err)
  }
  return null
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
  eventId?: string
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
      console.error('[projects] task assignment Ably publish error', err)
    }
  }

  await sendPushToUsers([userId], {
    title,
    body,
    url: taskPath,
  })

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
      url: taskUrl,
    })
  } catch (err) {
    console.error('[projects] task assignment email error', err)
  }

  if (!deadline) return

  try {
    const event = await createTaskDeadlineCalendarEvent({
      assigneeEmail: userEmail,
      eventId: trimText(params.eventId),
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
    console.error('[projects] task assignment calendar error', err)
  }
  return null
}

async function notifyTaskDependencyUnlocked(params: {
  userId: string
  projectId: string
  blockId: string
  taskId: string
  projectName: string
  blockName: string
  taskName: string
  dependencyTaskName: string
}) {
  const { userId, projectId, blockId, taskId, projectName, blockName, taskName, dependencyTaskName } = params
  const title = 'Ja pots començar una tasca'
  const body = `La dependència "${dependencyTaskName || 'tasca prèvia'}" ja està feta. Ja pots començar "${taskName || 'la teva tasca'}".`
  const now = Date.now()

  await db.collection('users').doc(userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: 'project_task_dependency_unlocked',
    projectId,
    blockId,
    taskId,
    projectName,
    blockName,
    taskName,
    dependencyTaskName,
  })
  await incrementUserUnreadCount(userId, 'project_task_dependency_unlocked', 1)

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: 'project_task_dependency_unlocked',
        projectId,
        blockId,
        taskId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[projects] task dependency unlocked Ably publish error', err)
    }
  }

  await sendPushToUsers([userId], {
    title,
    body,
    url: `/menu/projects/${projectId}?tab=tasks`,
  })
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

    const data = snap.data() as Record<string, unknown>
    const accessUser = {
      id: auth.user.id,
      name: auth.user.name,
      role: auth.user.role,
      department: auth.user.department,
    }
    if (
      !userHasGlobalProjectListAccess(accessUser) &&
      !userParticipatesInProject(accessUser, data)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ id: snap.id, ...data })
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

    await Promise.allSettled(
      collectProjectOutlookCalendarEvents(data.blocks).map(({ email, eventId }) =>
        deleteOutlookCalendarEvent(email, eventId)
      )
    )

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

    let userNotificationsRefs: Array<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>> = []
    try {
      userNotificationsRefs = (
        await db.collectionGroup('notifications').where('projectId', '==', id).get()
      ).docs.map((doc) => doc.ref)
    } catch (err) {
      console.warn('[projects] notifications cleanup skipped while deleting project', {
        projectId: id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

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

    const sprintsRaw = form.get('sprints')
    if (sprintsRaw !== null) {
      try {
        payload.sprints = JSON.parse(String(sprintsRaw))
      } catch {
        payload.sprints = Array.isArray(currentData.sprints) ? currentData.sprints : []
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
      kickoff: (payload.kickoff ?? currentData.kickoff ?? null) as KickoffData,
      blocks: (Array.isArray(payload.blocks) ? payload.blocks : currentData.blocks || []) as ProjectBlock[],
    })

    const nextBlocksForValidation = (
      Array.isArray(payload.blocks) ? payload.blocks : currentData.blocks || []
    ) as ProjectBlock[]

    if (Array.isArray(payload.blocks)) {
      payload.blocks = applyDependencyLocksToBlocks(nextBlocksForValidation).map((block) => ({
        ...block,
        status: deriveBlockStatus(block),
      }))
    }

    const lockedBlocksForValidation = (
      Array.isArray(payload.blocks) ? payload.blocks : nextBlocksForValidation
    ) as ProjectBlock[]
    const currentTasksById = new Map(
      (currentBlocks as ProjectBlock[]).flatMap((block) =>
        (block.tasks || []).map((task) => [String(task.id || '').trim(), task] as const)
      )
    )

    for (const block of lockedBlocksForValidation) {
      for (const task of Array.isArray(block.tasks) ? block.tasks : []) {
        const taskId = String(task?.id || '').trim()
        if (!taskId) continue
        const previousTask = currentTasksById.get(taskId)
        const previousStatus = normalizeTaskWorkflowStatus(previousTask?.status)
        const nextStatus = normalizeTaskWorkflowStatus(task?.status)

        if (previousStatus !== nextStatus && !canChangeTaskStatus(task, nextStatus, lockedBlocksForValidation)) {
          const dependency = getTaskDependencyMeta(lockedBlocksForValidation, task)
          const taskName = String(task?.title || 'Tasca').trim()
          const dependencyName = String(dependency?.dependencyTask.title || 'la tasca prèvia').trim()
          return NextResponse.json(
            {
              error: `La tasca "${taskName}" no es pot moure fins que "${dependencyName}" estigui feta.`,
            },
            { status: 400 }
          )
        }
      }
    }

    const nextRooms = Array.isArray(payload.rooms)
      ? (payload.rooms as Record<string, unknown>[])
      : currentRooms
    const nextBlocks = Array.isArray(payload.blocks)
      ? (payload.blocks as Record<string, unknown>[])
      : currentBlocks
    const nextRoomIds = new Set(nextRooms.map((room) => String(room.id || '')).filter(Boolean))
    const currentRoomIds = new Set(currentRooms.map((room) => String(room.id || '')).filter(Boolean))
    const removedRooms = currentRooms.filter((room) => {
      const roomId = String(room.id || '')
      if (!roomId || nextRoomIds.has(roomId)) return false
      const kind = String(room.kind || '')
      return kind === 'manual' || kind === 'block'
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
      const syncedBlocks: BlockRecord[] = nextBlocks.map((block) => ({
        ...block,
        tasks: Array.isArray(block.tasks) ? block.tasks.map((task) => ({ ...task })) : [],
      }))

      const blockAssignmentNotifications = syncedBlocks.map(async (block) => {
        const blockId = trimText(block.id)
        const blockName = trimText(block.name) || 'Bloc'
        const blockOwner = trimText(block.owner)
        const deadline = trimText(block.deadline)
        const previousBlock = currentBlocksById.get(blockId)
        const previousOwnerName = trimText(previousBlock?.owner)
        const { shouldNotifyRemoval, shouldNotifyAssignment } = resolveProjectOwnerTransition({
          previousOwnerName,
          nextOwnerName: blockOwner,
          treatAsNewAssignment: previousWasDraft,
        })

        if (!blockId || (!shouldNotifyRemoval && !shouldNotifyAssignment)) return null

        if (shouldNotifyRemoval) {
          const previousOwnerUser = await userResolver.findByName(previousOwnerName)
          if (previousOwnerUser?.id) {
            await notifyProjectOwnerRemoval({
              userId: previousOwnerUser.id,
              userName: trimText(previousOwnerUser.name) || previousOwnerName,
              userEmail: trimText(previousOwnerUser.email),
              senderEmail,
              projectId: id,
              projectName,
              blockId,
              blockName: trimText(previousBlock?.name) || blockName,
              eventId:
                equalText(previousBlock?.outlookEventEmail, previousOwnerUser.email)
                  ? trimText(previousBlock?.outlookEventId)
                  : '',
            })
          }
        }

        if (!shouldNotifyAssignment) return null

        const assignedUser = await userResolver.findByName(blockOwner)
        if (!assignedUser?.id) return null

        const eventRef = await notifyBlockOwnerAssignment({
          userId: assignedUser.id,
          userName: trimText(assignedUser.name) || blockOwner,
          userEmail: trimText(assignedUser.email),
          projectId: id,
          projectName,
          blockId,
          blockName,
          deadline,
          baseUrl,
          senderEmail,
          eventId:
            equalText(block.outlookEventEmail, assignedUser.email) ? trimText(block.outlookEventId) : '',
        })

        if (eventRef) {
          block.outlookEventId = eventRef.outlookEventId
          block.outlookEventWebLink = eventRef.outlookEventWebLink
          block.outlookEventEmail = eventRef.outlookEventEmail
        }

        return null
      })

      const taskAssignmentNotifications = syncedBlocks.flatMap((block) => {
        const blockId = trimText(block.id)
        const blockName = trimText(block.name) || 'Bloc'
        const previousBlock = currentBlocksById.get(blockId)
        const previousTasksById = new Map(
          (Array.isArray(previousBlock?.tasks) ? previousBlock.tasks : [])
            .map((task) => [trimText(task?.id), task] as const)
            .filter(([taskId]) => Boolean(taskId))
        )

        return (Array.isArray(block.tasks) ? block.tasks : []).map(async (task) => {
          const taskId = trimText(task?.id)
          const taskName = trimText(task?.title) || 'Tasca'
          const taskOwner = trimText(task?.owner)
          const deadline = trimText(task?.deadline)
          const previousTask = previousTasksById.get(taskId)
          const previousOwnerName = trimText(previousTask?.owner)
          const { shouldNotifyRemoval, shouldNotifyAssignment } = resolveProjectOwnerTransition({
            previousOwnerName,
            nextOwnerName: taskOwner,
            treatAsNewAssignment: previousWasDraft,
          })

          if (!taskId || (!shouldNotifyRemoval && !shouldNotifyAssignment)) return null

          if (shouldNotifyRemoval) {
            const previousOwnerUser = await userResolver.findByName(previousOwnerName)
            if (previousOwnerUser?.id) {
              await notifyProjectOwnerRemoval({
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

          const assignedUser = await userResolver.findByName(taskOwner)
          if (!assignedUser?.id) return null

          const eventRef = await notifyTaskOwnerAssignment({
            userId: assignedUser.id,
            userName: trimText(assignedUser.name) || taskOwner,
            userEmail: trimText(assignedUser.email),
            projectId: id,
            projectName,
            blockId,
            blockName,
            taskId,
            taskName,
            deadline,
            baseUrl,
            senderEmail,
            eventId:
              equalText(task.outlookEventEmail, assignedUser.email) ? trimText(task.outlookEventId) : '',
          })

          if (eventRef) {
            task.outlookEventId = eventRef.outlookEventId
            task.outlookEventWebLink = eventRef.outlookEventWebLink
            task.outlookEventEmail = eventRef.outlookEventEmail
          }

          return null
        })
      })

      const removedAssignmentNotifications = collectRemovedProjectAssignmentTargets({
        previousBlocks: currentBlocks,
        nextBlocks: syncedBlocks,
      }).map(async (target) => {
        const previousOwnerUser = await userResolver.findByName(target.previousOwnerName)
        if (!previousOwnerUser?.id) return null

        return notifyProjectOwnerRemoval({
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

      const taskDependencyUnlockedNotifications = nextBlocks.flatMap((block) => {
        const previousBlock = currentBlocksById.get(String(block.id || '').trim())
        const previousTasksById = new Map(
          (Array.isArray(previousBlock?.tasks) ? previousBlock.tasks : [])
            .map((task) => [String(task?.id || '').trim(), task] as const)
            .filter(([taskId]) => Boolean(taskId))
        )

        return (Array.isArray(block.tasks) ? block.tasks : []).flatMap((task) => {
          const taskId = String(task?.id || '').trim()
          if (!taskId) return []

          const previousTask = previousTasksById.get(taskId)
          const previousStatus = normalizeTaskWorkflowStatus(previousTask?.status)
          const nextStatus = normalizeTaskWorkflowStatus(String(task?.status || ''))

          if (previousStatus === 'done' || nextStatus !== 'done') return []

          return nextBlocks.flatMap((dependentBlock) =>
            (Array.isArray(dependentBlock.tasks) ? dependentBlock.tasks : []).map(async (dependentTask) => {
              if (String(dependentTask?.dependsOn || '').trim() !== taskId) return null
              if (normalizeTaskWorkflowStatus(String(dependentTask?.status || '')) === 'done') return null

              const dependentOwner = String(dependentTask?.owner || '').trim()
              if (!dependentOwner) return null

              const assignedUser = await userResolver.findByName(dependentOwner)
              if (!assignedUser?.id) return null

              return notifyTaskDependencyUnlocked({
                userId: assignedUser.id,
                projectId: id,
                blockId: String(dependentBlock.id || '').trim(),
                taskId: String(dependentTask?.id || '').trim(),
                projectName,
                blockName: String(dependentBlock.name || '').trim() || 'Bloc',
                taskName: String(dependentTask?.title || '').trim() || 'Tasca',
                dependencyTaskName: String(task?.title || '').trim() || 'Tasca',
              })
            })
          )
        })
      })

      const blockUpdateNotifications = syncedBlocks.map(async (block) => {
        const blockId = trimText(block.id)
        const blockName = trimText(block.name) || 'Bloc'
        const blockOwner = trimText(block.owner)
        const deadline = trimText(block.deadline)
        const previousBlock = currentBlocksById.get(blockId)
        const previousOwnerName = trimText(previousBlock?.owner)
        const previousBlockName = trimText(previousBlock?.name) || 'Bloc'
        const previousDeadline = trimText(previousBlock?.deadline)

        if (!blockId || !blockOwner || !previousBlock || !equalText(blockOwner, previousOwnerName)) return null

        const deadlineChanged = deadline !== previousDeadline
        const nameChanged = !equalText(blockName, previousBlockName)
        if (!deadlineChanged && !nameChanged) return null

        const assignedUser = await userResolver.findByName(blockOwner)
        const recipientEmail = trimText(assignedUser?.email)
        const recipientId = trimText(assignedUser?.id)
        const blockPath = `/menu/projects/${id}?tab=blocks&blockId=${encodeURIComponent(blockId)}`
        const blockUrl = `${String(baseUrl || '').replace(/\/$/, '')}${blockPath}`

        if (recipientId) {
          const title = "S'ha actualitzat un bloc teu"
          const body = `S'han actualitzat dades del bloc ${blockName}.`
          const now = Date.now()
          await db.collection('users').doc(recipientId).collection('notifications').add({
            title,
            body,
            createdAt: now,
            read: false,
            type: 'project_block_update',
            projectId: id,
            blockId,
            projectName,
            blockName,
          })
          await incrementUserUnreadCount(recipientId, 'project_block_update', 1)
          await sendPushToUsers([recipientId], { title, body, url: blockPath })
        }

        if (recipientEmail && senderEmail) {
          await sendProjectOwnerUpdateEmail({
            senderEmail,
            recipientEmail,
            recipientName: trimText(assignedUser?.name) || blockOwner,
            subject: `Actualitzacio de bloc - ${blockName} - ${projectName}`,
            lines: [
              `S'ha actualitzat el bloc ${blockName}.`,
              `Projecte: ${projectName}`,
              deadlineChanged ? `Nova data limit: ${deadline || 'Sense data'}` : '',
              nameChanged ? `Nom actual: ${blockName}` : '',
              `Obrir bloc: ${blockUrl}`,
            ],
          })
        }

        const currentBlockEventId = trimText(block.outlookEventId)
        const canReuseBlockEvent = equalText(block.outlookEventEmail, recipientEmail) && currentBlockEventId

        if (recipientEmail) {
          if (!deadline && canReuseBlockEvent) {
            await deleteOutlookCalendarEvent(recipientEmail, currentBlockEventId)
            block.outlookEventId = ''
            block.outlookEventWebLink = ''
            block.outlookEventEmail = ''
            return null
          }

          if (deadline) {
            const event = await createBlockDeadlineCalendarEvent({
              assigneeEmail: recipientEmail,
              eventId: canReuseBlockEvent ? currentBlockEventId : '',
              projectName,
              blockName,
              deadline,
              url: blockUrl,
            })
            block.outlookEventId = event.id
            block.outlookEventWebLink = event.webLink
            block.outlookEventEmail = recipientEmail
          }
        }

        return null
      })

      const taskUpdateNotifications = syncedBlocks.flatMap((block) => {
        const blockId = trimText(block.id)
        const blockName = trimText(block.name) || 'Bloc'
        const previousBlock = currentBlocksById.get(blockId)
        const previousBlockName = trimText(previousBlock?.name) || 'Bloc'
        const previousTasksById = new Map(
          (Array.isArray(previousBlock?.tasks) ? previousBlock.tasks : [])
            .map((task) => [trimText(task?.id), task] as const)
            .filter(([taskId]) => Boolean(taskId))
        )

        return (Array.isArray(block.tasks) ? block.tasks : []).map(async (task) => {
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
          const blockNameChanged = !equalText(blockName, previousBlockName)
          if (!deadlineChanged && !nameChanged && !blockNameChanged) return null

          const assignedUser = await userResolver.findByName(taskOwner)
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
      })

      await Promise.allSettled([
        ...(removedRooms.length > 0
          ? removedRooms.map((room) =>
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
        ...removedAssignmentNotifications,
        ...blockUpdateNotifications,
        ...taskUpdateNotifications,
        ...taskDependencyUnlockedNotifications,
        syncProjectRoomsWithChangedParticipants({
          projectId: id,
          project: {
            id,
            name: projectName,
            owner: String(payload.owner || currentData.owner || ''),
            rooms: nextRooms as ProjectRoomLike[],
            blocks: syncedBlocks as ProjectBlockLike[],
          },
          currentRooms: currentRooms as ProjectRoomLike[],
          nextRooms: nextRooms as ProjectRoomLike[],
        }),
      ])

      await persistProjectOutlookRefPatches(
        id,
        collectOutlookRefPatches(currentBlocks, syncedBlocks)
      )
    })

    return NextResponse.json({ id, document })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
