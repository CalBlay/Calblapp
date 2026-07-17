import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  defaultPushUrlForNotificationType,
  sendPushToUsers,
} from '@/lib/notifications/sendUserPush.server'
import { writeUserNotification } from '@/lib/notifications/writeUserNotification'
import {
  createIncidentActionDeadlineCalendarEvent,
  deleteOutlookCalendarEvent,
} from '@/services/graph/calendar'

type UserLookup = {
  id: string
  name?: string
  email?: string
}

type IncidentActionNotificationPayload = {
  type: 'incident_action_assigned'
  title: string
  body: string
  incidentId: string
  incidentNumber: string | null
  actionId: string
  actionTitle: string
  department?: string | null
  dueAt?: string | null
}

function normLower(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

async function findUserById(userId: string): Promise<UserLookup | null> {
  const id = String(userId || '').trim()
  if (!id) return null
  const doc = await db.collection('users').doc(id).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) } as UserLookup
}

async function findUserByName(rawName: string): Promise<UserLookup | null> {
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

async function resolveAssigneeUser(params: {
  assignedToId?: string | null
  assignedToName?: string | null
}): Promise<UserLookup | null> {
  const byId = params.assignedToId ? await findUserById(params.assignedToId) : null
  if (byId) return byId
  const name = String(params.assignedToName || '').trim()
  if (!name) return null
  return findUserByName(name)
}

function dueIsoToDeadlineDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function notifyIncidentActionAssigned(params: {
  userId: string
  payload: IncidentActionNotificationPayload
}) {
  const { userId, payload } = params
  const now = Date.now()

  await writeUserNotification(userId, {
    ...payload,
    createdAt: now,
    read: false,
  })

  if (process.env.ABLY_API_KEY) {
    try {
      const { getAblyRest } = await import('@/lib/server/ablyRest')
      const rest = getAblyRest()
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: payload.type,
        incidentId: payload.incidentId,
        actionId: payload.actionId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[incidentActionNotifications] Ably publish error', err)
    }
  }

  await sendPushToUsers([userId], {
    title: payload.title,
    body: payload.body,
    url: defaultPushUrlForNotificationType(payload.type, { incidentId: payload.incidentId }),
  })
}

export type IncidentActionAssigneeSideEffectsParams = {
  actionId: string
  incidentId: string
  incidentNumber?: string | null
  actionTitle: string
  assignedToId?: string | null
  assignedToName?: string | null
  dueAtIso?: string | null
  department?: string | null
  createdById?: string | null
  previousOutlookEventId?: string | null
  previousOutlookEmail?: string | null
  notifyAssignment?: boolean
}

export async function handleIncidentActionAssigneeSideEffects(
  params: IncidentActionAssigneeSideEffectsParams
): Promise<{ outlookEventId?: string; outlookEmail?: string }> {
  const assignee = await resolveAssigneeUser(params)
  const deadline = dueIsoToDeadlineDate(params.dueAtIso)

  const prevId = String(params.previousOutlookEventId || '').trim()
  const prevEmail = String(params.previousOutlookEmail || '').trim()
  if (prevId && prevEmail) {
    try {
      await deleteOutlookCalendarEvent(prevEmail, prevId)
    } catch (err) {
      console.error('[incidentActionNotifications] delete calendar error', err)
    }
  }

  let outlookEventId = ''
  let outlookEmail = ''

  if (assignee?.email && deadline) {
    try {
      const result = await createIncidentActionDeadlineCalendarEvent({
        assigneeEmail: assignee.email,
        actionTitle: params.actionTitle,
        incidentNumber: params.incidentNumber,
        deadline,
        department: params.department,
      })
      outlookEventId = result.id || ''
      outlookEmail = assignee.email
    } catch (err) {
      console.error('[incidentActionNotifications] calendar error', err)
    }
  }

  if (params.notifyAssignment && assignee?.id) {
    const incidentLabel = String(params.incidentNumber || params.incidentId || '').trim()
    const dueLabel = deadline ? ` · Data limit ${deadline.split('-').reverse().join('/')}` : ''
    const payload: IncidentActionNotificationPayload = {
      type: 'incident_action_assigned',
      title: "T'han assignat una acció d'incidència",
      body: [
        params.actionTitle || 'Acció',
        incidentLabel ? `Incidència ${incidentLabel}` : '',
        String(params.department || '').trim(),
      ]
        .filter(Boolean)
        .join(' · ')
        .concat(dueLabel),
      incidentId: params.incidentId,
      incidentNumber: params.incidentNumber || null,
      actionId: params.actionId,
      actionTitle: params.actionTitle,
      department: params.department || null,
      dueAt: params.dueAtIso || null,
    }
    try {
      await notifyIncidentActionAssigned({ userId: assignee.id, payload })
    } catch (err) {
      console.error('[incidentActionNotifications] notify error', err)
    }
  }

  return {
    outlookEventId: outlookEventId || undefined,
    outlookEmail: outlookEmail || undefined,
  }
}
