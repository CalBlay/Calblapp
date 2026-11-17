import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { incidentNotificationHref } from '@/lib/incidentNotificationLinks'
import { sendOutlookTextMail } from '@/services/graph/calendar'

type IncidentNotificationPayload = {
  type: 'incident_marketing_9xx_new'
  title: string
  body: string
  incidentId: string
  incidentNumber: string | null
  eventId?: string | null
  eventCode?: string | null
  categoryId?: string | null
  categoryLabel?: string | null
}

const MARKETING_DEPARTMENTS = new Set(['marqueting', 'marketing'])

export async function notifyMarketingManagersFor9xxIncident(params: {
  payload: IncidentNotificationPayload
  baseUrl?: string | null
  senderUserId?: string | null
  excludeIds?: string[]
}) {
  const { payload, excludeIds = [] } = params
  const snap = await db.collection('users').get()
  const targetUsers = snap.docs
    .filter((doc) => {
      const data = doc.data() as { role?: string; departmentLower?: string; department?: string }
      const role = normalizeRole(String(data.role || ''))
      const dept = String(data.departmentLower || data.department || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
      return role === 'cap' && MARKETING_DEPARTMENTS.has(dept)
    })
    .map((doc) => {
      const data = doc.data() as { email?: string; name?: string; displayName?: string }
      return {
        id: doc.id,
        email: String(data.email || '').trim(),
        name: String(data.name || data.displayName || '').trim(),
      }
    })
    .filter((user) => user.id && !excludeIds.includes(user.id))

  const targets = targetUsers.map((user) => user.id)

  if (!targets.length) return

  const now = Date.now()
  const batch = db.batch()
  for (const uid of targets) {
    const ref = db.collection('users').doc(uid).collection('notifications').doc()
    batch.set(ref, {
      ...payload,
      createdAt: now,
      read: false,
    })
  }
  await batch.commit()
  const { afterNotificationsCommitted } = await import('@/lib/notifications/writeUserNotification')
  await afterNotificationsCommitted(
    targets.map((uid) => ({ userId: uid, type: String(payload.type || '') }))
  )

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const { getAblyRest } = await import('@/lib/server/ablyRest')
      const rest = getAblyRest()
      await Promise.all(
        targets.map((uid) =>
          rest.channels.get(`user:${uid}:notifications`).publish('created', {
            type: payload.type,
            incidentId: payload.incidentId,
            createdAt: now,
          })
        )
      )
    } catch (err) {
      console.error('[incidentNotifications] Ably publish error', err)
    }
  }

  await sendPushToUsers(targets, {
    title: payload.title,
    body: payload.body,
    url: incidentNotificationHref(payload.incidentId),
  })

  const emailRecipients = targetUsers
    .filter((user) => user.email.includes('@'))
    .map((user) => ({ email: user.email, name: user.name || user.email }))
  if (!emailRecipients.length || !params.senderUserId) return

  try {
    const senderSnap = await db.collection('users').doc(params.senderUserId).get()
    const senderEmail = String(
      senderSnap.exists ? (senderSnap.data() as { email?: string }).email || '' : ''
    ).trim()
    if (!senderEmail.includes('@')) return

    const relativeUrl = incidentNotificationHref(payload.incidentId)
    const incidentUrl = params.baseUrl
      ? new URL(relativeUrl, params.baseUrl).toString()
      : relativeUrl
    await sendOutlookTextMail({
      organizerEmail: senderEmail,
      toRecipients: emailRecipients,
      subject: `${payload.title}${payload.incidentNumber ? ` - ${payload.incidentNumber}` : ''}`,
      bodyText: [
        'S\'ha registrat una nova incid\u00e8ncia de M\u00e0rqueting (9XX).',
        '',
        payload.body,
        '',
        `Obrir incid\u00e8ncia: ${incidentUrl}`,
      ].join('\n'),
    })
  } catch (err) {
    // El correu no ha d'impedir que la incid\u00e8ncia i la resta de notificacions es cre\u00efn.
    console.error('[incidentNotifications] marketing email error', err)
  }
}
