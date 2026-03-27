import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

type NotificationPayload = {
  type:
    | 'maintenance_ticket_new'
    | 'maintenance_ticket_assigned'
    | 'maintenance_ticket_validated'
  title: string
  body: string
  ticketId: string
  ticketCode: string | null
  status?: string | null
  priority?: string | null
  location?: string | null
  machine?: string | null
  source?: string | null
}

const normLower = (value?: string) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export async function notifyMaintenanceManagers(params: {
  payload: NotificationPayload
  excludeIds?: string[]
}) {
  const { payload, excludeIds = [] } = params
  const snap = await db.collection('users').where('departmentLower', '==', 'manteniment').get()
  const targets = snap.docs
    .filter((doc) => normalizeRole((doc.data() as any)?.role) === 'cap')
    .map((doc) => doc.id)
    .filter((id) => !excludeIds.includes(id))

  await createNotifications(targets, payload)
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

async function createNotifications(uids: string[], payload: NotificationPayload) {
  if (!uids.length) return

  const now = Date.now()
  const batch = db.batch()

  for (const uid of uids) {
    const ref = db.collection('users').doc(uid).collection('notifications').doc()
    batch.set(ref, {
      ...payload,
      createdAt: now,
      read: false,
    })
  }

  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
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
