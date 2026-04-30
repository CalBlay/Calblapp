import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

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
  excludeIds?: string[]
}) {
  const { payload, baseUrl, excludeIds = [] } = params
  const snap = await db.collection('users').get()
  const targets = snap.docs
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
    .map((doc) => doc.id)
    .filter((id) => id && !excludeIds.includes(id))

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

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const Ably = (await import('ably')).default
      const rest = new Ably.Rest({ key: apiKey })
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

  if (baseUrl) {
    await Promise.all(
      targets.map((userId) =>
        fetch(`${baseUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title: payload.title,
            body: payload.body,
            url: '/menu/incidents',
          }),
        }).catch((err) => {
          console.error('[incidentNotifications] push error', err)
        })
      )
    )
  }
}

