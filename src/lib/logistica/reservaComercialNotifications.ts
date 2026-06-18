import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { incrementUserUnreadCount } from '@/lib/notifications/unreadCounts'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'

export async function notifyReservaComercialUser(params: {
  userId: string
  title: string
  body: string
  type: string
  url: string
  reservationId: string
}) {
  if (!params.userId) return

  const now = Date.now()
  await db.collection('users').doc(params.userId).collection('notifications').add({
    type: params.type,
    title: params.title,
    body: params.body,
    url: params.url,
    reservationId: params.reservationId,
    createdAt: now,
    read: false,
  })
  await incrementUserUnreadCount(params.userId, params.type, 1)

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
      await rest.channels.get(`user:${params.userId}:notifications`).publish('created', {
        type: params.type,
        reservationId: params.reservationId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[reservaComercialNotifications] Ably publish error', err)
    }
  }

  await sendPushToUsers([params.userId], {
    title: params.title,
    body: params.body,
    url: params.url,
  })
}
