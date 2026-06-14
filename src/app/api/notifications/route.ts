import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { Query } from 'firebase-admin/firestore'
import { formatTornNotificationBody, formatTornNotificationLabel } from '@/lib/date-format'
import { resolveEventDisplayName } from '@/lib/eventDisplayName'
import { decrementUnreadFromNotificationDocs } from '@/lib/notifications/unreadCounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SessionUser {
  id: string
  role?: string
}

type NotificationFirestoreDoc = Record<string, unknown> & {
  createdAt?: number
  read?: boolean
  type?: string
}

type NotificationListItem = { id: string } & NotificationFirestoreDoc

function formatNotificationForClient(item: NotificationListItem): NotificationListItem {
  const type = String(item.type || '').trim()
  if (type !== 'torn' && type !== 'NEW_SHIFTS') return item
  const eventDate =
    typeof item.eventDate === 'string'
      ? item.eventDate
      : typeof item.eventDate === 'number'
        ? String(item.eventDate)
        : null
  const eventName = String(item.eventName || '').trim()
  return {
    ...item,
    body: eventName
      ? formatTornNotificationLabel(eventName, eventDate)
      : formatTornNotificationBody(String(item.body || ''), eventDate),
  }
}

async function enrichTornNotificationNames(items: NotificationListItem[]): Promise<NotificationListItem[]> {
  const eventIds = new Set<string>()
  for (const item of items) {
    const type = String(item.type || '').trim()
    if (type !== 'torn' && type !== 'NEW_SHIFTS') continue
    if (String(item.eventName || '').trim()) continue
    const eventId = String(item.eventId || '').trim()
    if (eventId) eventIds.add(eventId)
  }
  if (eventIds.size === 0) return items

  const nameById = new Map<string, string>()
  await Promise.all(
    [...eventIds].map(async (eventId) => {
      try {
        const snap = await db.collection('stage_verd').doc(eventId).get()
        if (!snap.exists) return
        const name = resolveEventDisplayName(snap.data() as Record<string, unknown>)
        if (name) nameById.set(eventId, name)
      } catch {
        /* ignore lookup errors */
      }
    })
  )

  if (nameById.size === 0) return items

  return items.map((item) => {
    const type = String(item.type || '').trim()
    if (type !== 'torn' && type !== 'NEW_SHIFTS') return item
    if (String(item.eventName || '').trim()) return item
    const eventId = String(item.eventId || '').trim()
    const eventName = eventId ? nameById.get(eventId) : ''
    return eventName ? { ...item, eventName } : item
  })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as SessionUser).id
  if (!userId) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'count'
  const type = (searchParams.get('type') || '').trim()

  try {
    const notificationsRef = db
      .collection('users')
      .doc(userId)
      .collection('notifications')
    let baseRef: Query = notificationsRef

    if (type) {
      baseRef = baseRef.where('type', '==', type)
    }

    if (mode === 'count') {
      const snap = await baseRef.where('read', '==', false).count().get()
      return NextResponse.json({ count: snap.data().count })
    }

    let listDocs: NotificationListItem[] = []
    if (type) {
      const listSnap = await baseRef.limit(200).get()
      listDocs = listSnap.docs.map((d) => {
        const data = d.data() as NotificationFirestoreDoc
        return { id: d.id, ...data }
      })
      listDocs.sort((a, b) => {
        const av = typeof a.createdAt === 'number' ? a.createdAt : 0
        const bv = typeof b.createdAt === 'number' ? b.createdAt : 0
        return bv - av
      })
      listDocs = listDocs.slice(0, 50)
    } else {
      const listSnap = await baseRef.orderBy('createdAt', 'desc').limit(50).get()
      listDocs = listSnap.docs.map((d) => {
        const data = d.data() as NotificationFirestoreDoc
        return { id: d.id, ...data }
      })
    }
    listDocs = await enrichTornNotificationNames(listDocs)
    listDocs = listDocs.map(formatNotificationForClient)
    return NextResponse.json({ notifications: listDocs })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as SessionUser).id
  if (!userId) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
  }

  try {
    const body = (await req.json()) as {
      action?: string
      type?: string
      notificationId?: string
      requestId?: string
      deliveryId?: string
    }
    const action = body.action || ''
    const type = (body.type || '').trim()
    const notificationId = (body.notificationId || '').trim()
    const requestId = (body.requestId || '').trim()
    const deliveryId = (body.deliveryId || '').trim()

    const notificationsRef = db
      .collection('users')
      .doc(userId)
      .collection('notifications')
    let baseRef: Query = notificationsRef

    if (type) {
      baseRef = baseRef.where('type', '==', type)
    }

    if (action === 'markAllRead') {
      const snap = await baseRef.where('read', '==', false).get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.update(d.ref, { read: true }))
      await batch.commit()
      await decrementUnreadFromNotificationDocs(userId, snap.docs)
      return NextResponse.json({ success: true })
    }

    if (action === 'markRead') {
      if (!notificationId) {
        return NextResponse.json({ error: 'notificationId required' }, { status: 400 })
      }
      const existing = await notificationsRef.doc(notificationId).get()
      if (existing.exists) {
        await decrementUnreadFromNotificationDocs(userId, [existing])
      }
      await notificationsRef.doc(notificationId).delete()
      return NextResponse.json({ success: true })
    }

    if (action === 'clearCommercialVehicle') {
      const commercialTypes = new Set([
        'commercial_vehicle_request',
        'commercial_vehicle_validation',
      ])
      const snap = await notificationsRef.limit(200).get()
      const matches = snap.docs.filter((doc) =>
        commercialTypes.has(String((doc.data() as NotificationFirestoreDoc).type || '').trim())
      )
      if (matches.length > 0) {
        await decrementUnreadFromNotificationDocs(userId, matches)
        const batch = db.batch()
        matches.forEach((doc) => batch.delete(doc.ref))
        await batch.commit()
      }
      return NextResponse.json({ success: true, deleted: matches.length })
    }

    if (action === 'markResolvedRoba') {
      const robaTypes = new Set([
        'roba_personal_request',
        'roba_personal_sent_to_rrhh',
        'roba_personal_ready',
        'roba_personal_delivery_ack',
        'roba_personal_delivery_revised',
        'roba_personal_delivery_dispute',
        'roba_personal_cancelled',
      ])
      const snap = await notificationsRef.where('read', '==', false).limit(200).get()
      const matches = snap.docs.filter((d) => {
        const data = d.data() as NotificationFirestoreDoc & {
          requestId?: string
          deliveryId?: string
        }
        const ntype = String(data.type || '').trim()
        if (!robaTypes.has(ntype)) return false
        const reqMatch = requestId && String(data.requestId || '').trim() === requestId
        const delMatch = deliveryId && String(data.deliveryId || '').trim() === deliveryId
        return Boolean(reqMatch || delMatch)
      })
      if (matches.length > 0) {
        const batch = db.batch()
        matches.forEach((d) => batch.update(d.ref, { read: true }))
        await batch.commit()
      }
      return NextResponse.json({ success: true, updated: matches.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
