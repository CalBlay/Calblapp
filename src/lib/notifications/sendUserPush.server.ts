import 'server-only'

import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db, messagingAdmin } from '@/lib/firebaseAdmin'
import webpush from 'web-push'

export type SendUserPushParams = {
  userId: string
  title: string
  body: string
  url?: string
}

export type SendUserPushResult = {
  success: boolean
  sent: number
  skipped?: 'push_disabled' | 'no_subscriptions'
}

function maintenanceTicketPushUrl(ticketId?: string | null) {
  const id = String(ticketId || '').trim()
  if (!id) return '/menu/manteniment/tickets'
  return `/menu/manteniment/tickets?ticketId=${encodeURIComponent(id)}&ops=1`
}

/** URL de destí per tipus de notificació in-app (deep link push). */
export function defaultPushUrlForNotificationType(
  type: string,
  extras?: {
    ticketId?: string | null
    projectId?: string | null
    reservationId?: string | null
    incidentId?: string | null
  }
): string {
  switch (String(type || '').trim()) {
    case 'user_request':
      return '/menu/users'
    case 'user_request_result':
      return '/menu/personnel'
    case 'torn':
      return '/menu/torns'
    case 'project_assignment':
    case 'project_block_assignment':
    case 'project_task_assignment':
    case 'project_room_task_assignment':
      return extras?.projectId
        ? `/menu/projects/${encodeURIComponent(String(extras.projectId))}`
        : '/menu/projects'
    case 'maintenance_ticket_new':
    case 'maintenance_ticket_assigned':
    case 'maintenance_ticket_resolved':
    case 'maintenance_ticket_pending_cap_validation':
    case 'maintenance_ticket_validated':
    case 'maintenance_ticket_stale':
    case 'maintenance_ticket_external_stale':
      return maintenanceTicketPushUrl(extras?.ticketId)
    case 'incident_marketing_9xx_new':
    case 'incident_action_assigned':
      return extras?.incidentId
        ? `/menu/incidents?incidentId=${encodeURIComponent(String(extras.incidentId))}`
        : '/menu/incidents'
    case 'event_extras_registered':
      return '/menu/events'
    case 'event_comanda_warehouse':
    case 'event_comanda_batch_sent':
      return '/menu/events'
    case 'transport_review_due':
    case 'transport_itv_due':
      return '/menu/logistica/transports'
    case 'quadrant_survey':
      return '/menu/sondeigs'
    case 'commercial_vehicle_request':
      return '/menu/logistica/reserva-comercials?tab=validacio'
    case 'commercial_vehicle_validation':
      return '/menu/logistica/reserva-comercials?tab=sollicitud'
    case 'roba_personal_request':
    case 'roba_personal_sent_to_rrhh':
    case 'roba_personal_cancelled':
    case 'roba_personal_ready':
    case 'roba_personal_delivery_ack':
    case 'roba_personal_delivery_dispute':
    case 'roba_personal_delivery_revised':
      return '/menu/roba-personal'
    default:
      return '/menu'
  }
}

type FcmTarget = { token: string; docRef: DocumentReference }

/** Un token FCM actiu per plataforma (el més recent). */
function pickFcmTargets(docs: QueryDocumentSnapshot[]): FcmTarget[] {
  const byPlatform = new Map<string, FcmTarget & { createdAt: number }>()

  for (const doc of docs) {
    const data = doc.data() as { token?: string; platform?: string; createdAt?: number }
    const token = String(data.token || '').trim()
    if (!token) continue

    const platform = String(data.platform || 'android').trim().toLowerCase()
    const createdAt = typeof data.createdAt === 'number' ? data.createdAt : 0
    const prev = byPlatform.get(platform)
    if (!prev || createdAt >= prev.createdAt) {
      byPlatform.set(platform, { token, docRef: doc.ref, createdAt })
    }
  }

  return [...byPlatform.values()].map(({ token, docRef }) => ({ token, docRef }))
}

type WebPushTarget = { subscription: unknown; docRef: DocumentReference }

/** Una subscripció web push per endpoint (la més recent). */
function pickWebPushTargets(docs: QueryDocumentSnapshot[]): WebPushTarget[] {
  const byEndpoint = new Map<string, WebPushTarget & { createdAt: number }>()

  for (const doc of docs) {
    const data = doc.data() as {
      subscription?: { endpoint?: string }
      endpoint?: string
      createdAt?: number
      updatedAt?: number
    }
    const subscription = data.subscription
    if (!subscription) continue

    const endpoint = String(data.endpoint || data.subscription?.endpoint || '').trim() || doc.id
    const createdAt =
      typeof data.updatedAt === 'number'
        ? data.updatedAt
        : typeof data.createdAt === 'number'
          ? data.createdAt
          : 0
    const prev = byEndpoint.get(endpoint)
    if (!prev || createdAt >= prev.createdAt) {
      byEndpoint.set(endpoint, { subscription, docRef: doc.ref, createdAt })
    }
  }

  return [...byEndpoint.values()].map(({ subscription, docRef }) => ({ subscription, docRef }))
}

export async function sendUserPush(params: SendUserPushParams): Promise<SendUserPushResult> {
  const { userId, title, body, url } = params
  const uid = String(userId || '').trim()
  if (!uid || !title || !body) {
    return { success: false, sent: 0 }
  }

  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null
  if (userData?.pushEnabled === false) {
    return { success: true, sent: 0, skipped: 'push_disabled' }
  }

  const [subsSnap, fcmSnap] = await Promise.all([
    userRef.collection('pushSubscriptions').get(),
    userRef.collection('fcmTokens').get(),
  ])

  if (subsSnap.empty && fcmSnap.empty) {
    return { success: true, sent: 0, skipped: 'no_subscriptions' }
  }

  let sent = 0
  const targetUrl = url || '/'
  const fcmTargets = pickFcmTargets(fcmSnap.docs)

  // App nativa: FCM només (evita duplicar amb Web Push del WebView).
  if (fcmTargets.length > 0) {
    const tokens = fcmTargets.map((t) => t.token)
    const res = await messagingAdmin.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url: targetUrl },
      android: {
        priority: 'high',
        notification: {
          icon: 'ic_stat_cb',
          color: '#0f766e',
        },
      },
    })

    sent += res.successCount

    res.responses.forEach((r, idx) => {
      if (r.success) return
      const code = r.error?.code
      if (code === 'messaging/registration-token-not-registered') {
        void fcmTargets[idx]?.docRef.delete()
      }
    })

    return { success: true, sent }
  }

  const webTargets = pickWebPushTargets(subsSnap.docs)
  if (webTargets.length === 0) {
    return { success: true, sent: 0, skipped: 'no_subscriptions' }
  }

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE
  const VAPID_MAILTO = process.env.VAPID_MAILTO || 'mailto:it@calblay.com'

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[sendUserPush] Missing VAPID keys for web push')
    return { success: true, sent: 0 }
  }

  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE)
  const payload = JSON.stringify({
    title,
    body,
    url: targetUrl,
    icon: '/icons/cb.svg',
    badge: '/icons/cb.svg',
  })

  await Promise.all(
    webTargets.map(async ({ subscription, docRef }) => {
      try {
        await webpush.sendNotification(subscription, payload, {
          TTL: 60 * 60,
          urgency: 'high',
        })
        sent++
      } catch (err: unknown) {
        const statusCode =
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          typeof (err as { statusCode?: unknown }).statusCode === 'number'
            ? (err as { statusCode: number }).statusCode
            : undefined
        if (statusCode === 404 || statusCode === 410) {
          await docRef.delete()
        }
      }
    })
  )

  return { success: true, sent }
}

export async function sendPushToUsers(
  userIds: string[],
  notification: { title: string; body: string; url?: string }
): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (!uniqueIds.length) return

  await Promise.all(
    uniqueIds.map((userId) =>
      sendUserPush({ userId, ...notification }).catch((err) => {
        console.error('[sendPushToUsers]', userId, err)
      })
    )
  )
}
