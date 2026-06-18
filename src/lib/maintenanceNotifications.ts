import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { formatDateTimeValue } from '@/lib/date-format'
import { normalizeRole } from '@/lib/roles'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { listMaintenanceTicketInboxRecipientIds } from '@/lib/server/maintenanceTicketInboxRecipients'
import {
  defaultPushUrlForNotificationType,
  sendPushToUsers,
} from '@/lib/notifications/sendUserPush.server'
import {
  getLastExternalFollowUpAt,
  getTicketAgeDays,
  isExternalizedTicketStaleAlert,
  isTicketHandled,
  isTicketStaleAlert,
  normalizeTicketWorkflowStage,
  STALE_TICKET_DAYS,
  type TicketAlertSnapshot,
} from '@/lib/maintenanceTicketAlerts'

type NotificationPayload = {
  type:
    | 'maintenance_ticket_new'
    | 'maintenance_ticket_assigned'
    | 'maintenance_ticket_resolved'
    | 'maintenance_ticket_pending_cap_validation'
    | 'maintenance_ticket_validated'
    | 'maintenance_ticket_stale'
    | 'maintenance_ticket_external_stale'
  title: string
  body: string
  ticketId: string
  ticketCode: string | null
  status?: string | null
  priority?: string | null
  location?: string | null
  machine?: string | null
  source?: string | null
  workflowStage?: string | null
}

type TicketWorkflowStage = 'tickets_inbox' | 'planner_queue'

function staleNotificationDocId(ticketId: string, userId: string, workflowStage: TicketWorkflowStage) {
  return `maintenance_ticket_stale__${ticketId}__${userId}__${workflowStage}`
}

function externalStaleNotificationDocId(ticketId: string, userId: string) {
  return `maintenance_ticket_external_stale__${ticketId}__${userId}`
}

async function getLogisticsTicketUserIds(): Promise<string[]> {
  return listMaintenanceTicketInboxRecipientIds()
}

async function getMaintenanceCapUserIds(): Promise<string[]> {
  const snap = await db.collection('users').where('departmentLower', '==', 'manteniment').get()
  return snap.docs
    .filter((doc) => {
      const data = doc.data() as { role?: string; department?: string; departmentLower?: string }
      const role = normalizeRole(String(data.role || ''))
      const dept = String(data.departmentLower || data.department || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
      return role === 'cap' && isMaintenanceCapDepartment(dept)
    })
    .map((doc) => doc.id)
}

export async function notifyMaintenanceManagers(params: {
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  const { payload, excludeIds = [] } = params
  const targets = (await getMaintenanceCapUserIds()).filter((id) => !excludeIds.includes(id))
  await createNotifications(targets, payload)
}

async function notifyLogisticsTicketUsers(params: {
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  const { payload, excludeIds = [] } = params
  const targets = (await getLogisticsTicketUserIds()).filter((id) => !excludeIds.includes(id))
  await createNotifications(targets, payload)
}

/** Notifica segons el mòdul on entra el ticket (inbox logística vs cua del planificador). */
export async function notifyForNewMaintenanceTicket(params: {
  workflowStage: string
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  const stage = normalizeTicketWorkflowStage(params.workflowStage)
  const payload = { ...params.payload, workflowStage: stage }

  if (stage === 'planner_queue') {
    await notifyMaintenanceManagers({ payload, excludeIds: params.excludeIds })
    return
  }

  await notifyLogisticsTicketUsers({ payload, excludeIds: params.excludeIds })
}

/** Quan un ticket passa del mòdul tickets al planificador. */
export async function notifyTicketEnteredPlanner(params: {
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  await notifyMaintenanceManagers({
    payload: { ...params.payload, workflowStage: 'planner_queue' },
    excludeIds: params.excludeIds,
  })
}

export async function notifyMaintenanceAssignees(params: {
  uids: string[]
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  const { uids, payload, excludeIds = [] } = params
  const targets = Array.from(new Set(uids)).filter((id) => id && !excludeIds.includes(id))
  await createNotifications(targets, payload)
}

export async function notifyTicketCreator(params: {
  uid?: string | null
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  const { uid, payload, excludeIds = [] } = params
  if (!uid) return
  if (excludeIds.includes(uid)) return
  await createNotifications([uid], payload)
}

/** Gestor ha resolt directament: el creador ha de validar. */
export async function notifyTicketResolvedForCreator(params: {
  uid?: string | null
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  await notifyTicketCreator(params)
}

/** Creador validat: avisa el cap de manteniment per completar la validació. */
export async function notifyTicketPendingCapValidation(params: {
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  await notifyMaintenanceManagers(params)
}

async function createNotifications(uids: string[], payload: NotificationPayload, docId?: string) {
  if (!uids.length) return

  const now = Date.now()
  const batch = db.batch()

  for (const uid of uids) {
    const ref = docId
      ? db.collection('users').doc(uid).collection('notifications').doc(docId)
      : db.collection('users').doc(uid).collection('notifications').doc()
    const data = {
      ...payload,
      createdAt: now,
      read: false,
    }
    if (docId) {
      batch.set(ref, data, { merge: true })
    } else {
      batch.set(ref, data)
    }
  }

  await batch.commit()
  const { afterNotificationsCommitted } = await import('@/lib/notifications/writeUserNotification')
  await afterNotificationsCommitted(
    uids.map((uid) => ({ userId: uid, type: String(payload.type || '') }))
  )

  if (process.env.ABLY_API_KEY) {
    try {
      const { getAblyRest } = await import('@/lib/server/ablyRest')
      const rest = getAblyRest()
      await Promise.all(
        uids.map((uid) =>
          rest.channels.get(`user:${uid}:notifications`).publish('created', {
            type: payload.type,
            ticketId: payload.ticketId,
            createdAt: now,
          })
        )
      )
    } catch (err) {
      console.error('[maintenanceNotifications] Ably publish error', err)
    }
  }

  await sendPushToUsers(uids, {
    title: payload.title,
    body: payload.body,
    url: defaultPushUrlForNotificationType(payload.type, { ticketId: payload.ticketId }),
  })
}

export function buildTicketBody(params: {
  machine?: string | null
  location?: string | null
  description?: string | null
}) {
  const parts = [
    (params.machine || '').trim(),
    (params.location || '').trim(),
    (params.description || '').trim(),
  ].filter(Boolean)

  return parts.join(' \u00B7 ')
}

export function buildAssignedTicketBodyForCreator(params: {
  machine?: string | null
  location?: string | null
  description?: string | null
  operatorNames?: Array<string | null | undefined>
  plannedStart?: number | string | null
}) {
  const operators = (params.operatorNames || []).map((name) => String(name || '').trim()).filter(Boolean)
  const planned = formatDateTimeValue(params.plannedStart, '')
  const parts = [
    buildTicketBody(params),
    operators.length ? `Operari: ${operators.join(', ')}` : '',
    planned ? `Previst: ${planned}` : '',
  ].filter(Boolean)

  return parts.join(' \u00B7 ')
}

function buildStalePayload(ticket: TicketAlertSnapshot & { id: string; ticketCode?: string | null }) {
  const stage = normalizeTicketWorkflowStage(ticket.workflowStage) as TicketWorkflowStage
  const ageDays = getTicketAgeDays(ticket.createdAt)
  const code = String(ticket.ticketCode || '').trim()
  const moduleLabel = stage === 'planner_queue' ? 'planificador' : 'tickets'

  return {
    type: 'maintenance_ticket_stale' as const,
    title: `Ticket pendent +${STALE_TICKET_DAYS} dies`,
    body: [
      code || ticket.id,
      `Modul ${moduleLabel}`,
      `${ageDays} dies sense assignar ni planificar`,
    ]
      .filter(Boolean)
      .join(' \u00B7 '),
    ticketId: ticket.id,
    ticketCode: code || null,
    status: ticket.status || null,
    workflowStage: stage,
  }
}

function buildExternalStalePayload(
  ticket: TicketAlertSnapshot & {
    id: string
    ticketCode?: string | null
    supplierName?: string | null
    location?: string | null
    machine?: string | null
  }
) {
  const lastAt = getLastExternalFollowUpAt(ticket)
  const ageDays = lastAt ? getTicketAgeDays(lastAt) : STALE_TICKET_DAYS
  const code = String(ticket.ticketCode || '').trim()
  const supplier = String(ticket.supplierName || 'Proveidor').trim()

  return {
    type: 'maintenance_ticket_external_stale' as const,
    title: `Seguiment proveidor +${STALE_TICKET_DAYS} dies`,
    body: [
      code || ticket.id,
      supplier,
      `${ageDays} dies sense resposta · truca o reenvia`,
    ]
      .filter(Boolean)
      .join(' \u00B7 '),
    ticketId: ticket.id,
    ticketCode: code || null,
    status: ticket.status || null,
    workflowStage: 'externalized',
    location: ticket.location || null,
    machine: ticket.machine || null,
  }
}

/** Cron: avisa caps de manteniment per tickets externalitzats sense resposta del proveidor. */
export async function processStaleExternalizedTicketNotifications() {
  const snap = await db.collection('maintenanceTickets').get()
  let sent = 0

  for (const doc of snap.docs) {
    const data = doc.data() as TicketAlertSnapshot & {
      ticketCode?: string | null
      supplierName?: string | null
      location?: string | null
      machine?: string | null
    }

    const ticket = { id: doc.id, ...data }
    if (!isExternalizedTicketStaleAlert(ticket)) continue

    const payload = buildExternalStalePayload(ticket)
    const targets = await getMaintenanceCapUserIds()
    if (!targets.length) continue

    await Promise.all(
      targets.map((uid) =>
        createNotifications([uid], payload, externalStaleNotificationDocId(ticket.id, uid))
      )
    )
    sent += targets.length
  }

  return { checked: snap.size, notificationsSent: sent }
}

/** Cridat des del cron: avisa logística (inbox) o cap manteniment (planificador) per tickets endarrerits. */
export async function processStaleMaintenanceTicketNotifications() {
  const snap = await db.collection('maintenanceTickets').get()
  let sent = 0

  for (const doc of snap.docs) {
    const data = doc.data() as TicketAlertSnapshot & {
      ticketCode?: string | null
      priority?: string | null
      location?: string | null
      machine?: string | null
      source?: string | null
    }

    const ticket = { id: doc.id, ...data }
    if (!isTicketStaleAlert(ticket)) continue

    const stage = normalizeTicketWorkflowStage(ticket.workflowStage) as TicketWorkflowStage
    const payload = buildStalePayload(ticket)

    const recipients =
      stage === 'planner_queue'
        ? await getMaintenanceCapUserIds()
        : await getLogisticsTicketUserIds()

    const targets = recipients.filter(Boolean)
    if (!targets.length) continue

    await Promise.all(
      targets.map((uid) =>
        createNotifications([uid], payload, staleNotificationDocId(ticket.id, uid, stage))
      )
    )
    sent += targets.length
  }

  return { checked: snap.size, notificationsSent: sent }
}

export async function clearExternalStaleMaintenanceTicketNotifications(ticketId: string) {
  const capIds = await getMaintenanceCapUserIds()
  if (!capIds.length) return

  const batch = db.batch()
  for (const uid of capIds) {
    batch.delete(
      db
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .doc(externalStaleNotificationDocId(ticketId, uid))
    )
  }
  await batch.commit()
}

/** Elimina avisos de retard quan el ticket ja s'ha gestionat. */
export async function clearStaleMaintenanceTicketNotifications(ticketId: string) {
  const logisticsIds = await getLogisticsTicketUserIds()
  const capIds = await getMaintenanceCapUserIds()
  const stages: TicketWorkflowStage[] = ['tickets_inbox', 'planner_queue']
  const batch = db.batch()

  for (const uid of [...logisticsIds, ...capIds]) {
    for (const stage of stages) {
      batch.delete(
        db
          .collection('users')
          .doc(uid)
          .collection('notifications')
          .doc(staleNotificationDocId(ticketId, uid, stage))
      )
    }
  }

  await batch.commit()
}

export async function onMaintenanceTicketUpdated(
  ticketId: string,
  ticket: TicketAlertSnapshot
) {
  if (isTicketHandled(ticket)) {
    await clearStaleMaintenanceTicketNotifications(ticketId)
  }
  if (!isExternalizedTicketStaleAlert(ticket)) {
    await clearExternalStaleMaintenanceTicketNotifications(ticketId)
  }
}
