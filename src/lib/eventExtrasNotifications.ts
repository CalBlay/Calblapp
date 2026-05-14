import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { lookupUidByNameLoose } from '@/lib/eventExtras'

type NotifyEventExtrasParams = {
  commercialInternalName?: string | null
  baseUrl?: string | null
  eventId: string
  eventCode?: string | null
  eventSummary?: string | null
  eventDay?: string | null
  entriesCount: number
  createdByName?: string | null
}

export async function notifyCommercialInternalForEventExtras(
  params: NotifyEventExtrasParams
) {
  const uid = await lookupUidByNameLoose(params.commercialInternalName)
  if (!uid) {
    return { notified: false, userId: null as string | null, reason: 'user_not_found' as const }
  }

  const title = 'Nous extres registrats'
  const summary = String(params.eventSummary || '').replace(/#.*$/, '').trim()
  const eventLabel = summary || String(params.eventCode || params.eventId || '').trim() || 'esdeveniment'
  const createdBy = String(params.createdByName || '').trim()
  const body =
    params.entriesCount === 1
      ? `S'ha registrat 1 extra a ${eventLabel}${createdBy ? ` per ${createdBy}` : ''}.`
      : `S'han registrat ${params.entriesCount} extres a ${eventLabel}${createdBy ? ` per ${createdBy}` : ''}.`

  const now = Date.now()
  const payload = {
    type: 'event_extras_registered',
    title,
    body,
    eventId: params.eventId,
    eventCode: params.eventCode || null,
    eventDay: params.eventDay || null,
    createdAt: now,
    read: false,
  }

  await db.collection('users').doc(uid).collection('notifications').add(payload)

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const Ably = (await import('ably')).default
      const rest = new Ably.Rest({ key: apiKey })
      await rest.channels.get(`user:${uid}:notifications`).publish('created', payload)
    } catch (error) {
      console.error('[eventExtrasNotifications] Ably publish error', error)
    }
  }

  if (params.baseUrl) {
    await fetch(`${params.baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid,
        title,
        body,
        url: '/menu/events',
      }),
    }).catch((error) => {
      console.error('[eventExtrasNotifications] push error', error)
    })
  }

  return { notified: true, userId: uid, reason: null as null }
}
