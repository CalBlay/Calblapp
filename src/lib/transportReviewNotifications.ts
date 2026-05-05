import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import {
  createTransportItvCalendarEvent,
  createTransportReviewCalendarEvent,
} from '@/services/graph/calendar'

type TransportMonthlyMileageEntry = {
  month?: string
  km?: number
}

type TransportRecord = {
  plate?: string
  type?: string
  itvExpiry?: string | null
  lastService?: string | null
  lastServiceKm?: number | null
  monthlyMileage?: TransportMonthlyMileageEntry[]
  lastReviewNotificationKey?: string | null
  lastItvNotificationKey?: string | null
  lastReviewCalendarKeys?: Record<string, string>
  lastItvCalendarKeys?: Record<string, string>
}

type TransportAlert = {
  family: 'review' | 'itv'
  key: string
  type: 'annual' | 'km' | 'itv_due' | 'itv_expired'
  title: string
  body: string
  notificationType: 'transport_review_due' | 'transport_itv_due'
  calendarDate: string
  expiryDate?: string
}

const DAY_MS = 1000 * 60 * 60 * 24

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('ca-ES')
}

function formatKm(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(value)} km`
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function firstDayOfNextMonth(date: Date): string {
  const next = new Date(date)
  next.setMonth(next.getMonth() + 1, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function subtractDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateValue
  date.setDate(date.getDate() - days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function notificationDocId(prefix: string, transportId: string, userId: string, key: string) {
  return `${prefix}__${transportId}__${userId}__${encodeURIComponent(key)}`
}

function getLatestMileage(entries?: TransportMonthlyMileageEntry[]): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null
  return entries.reduce<number | null>((max, entry) => {
    const km = Number(entry?.km)
    if (!Number.isFinite(km) || km < 0) return max
    return max == null ? km : Math.max(max, km)
  }, null)
}

function buildReviewAlert(transportId: string, transport: TransportRecord, today: Date): TransportAlert | null {
  const plate = String(transport.plate || '').trim() || transportId
  const lastService = String(transport.lastService || '').trim()
  if (!lastService) return null

  const lastServiceDate = new Date(lastService)
  if (Number.isNaN(lastServiceDate.getTime())) return null

  const reminderDate = firstDayOfNextMonth(today)
  const isLargeTruck = transport.type === 'camioGran' || transport.type === 'camioGranFred'
  const kmThreshold = isLargeTruck ? 40000 : 20000
  const latestMileage = getLatestMileage(transport.monthlyMileage)
  const lastServiceKm =
    typeof transport.lastServiceKm === 'number' &&
    Number.isFinite(transport.lastServiceKm) &&
    transport.lastServiceKm >= 0
      ? transport.lastServiceKm
      : null

  if (
    typeof latestMileage === 'number' &&
    typeof lastServiceKm === 'number' &&
    latestMileage >= lastServiceKm
  ) {
    const kmSinceService = latestMileage - lastServiceKm
    if (kmSinceService >= kmThreshold) {
      return {
        family: 'review',
        key: `km:${lastService}:${lastServiceKm}:${kmThreshold}`,
        type: 'km',
        title: `Revisio pendent del vehicle ${plate}`,
        body: `${plate} ha superat el llindar de revisio per km (${formatKm(kmSinceService)} des de l ultima revisio).`,
        notificationType: 'transport_review_due',
        calendarDate: reminderDate,
      }
    }
  }

  const annualDueDate = addYears(lastServiceDate, 1)
  const diffDays = Math.round((annualDueDate.getTime() - today.getTime()) / DAY_MS)
  if (diffDays < 0) {
    return {
      family: 'review',
      key: `annual:${lastService}`,
      type: 'annual',
      title: `Revisio pendent del vehicle ${plate}`,
      body: `${plate} te la revisio anual vencuda des del ${formatDate(annualDueDate.toISOString())}.`,
      notificationType: 'transport_review_due',
      calendarDate: reminderDate,
    }
  }

  return null
}

function buildItvAlert(transportId: string, transport: TransportRecord, today: Date): TransportAlert | null {
  const plate = String(transport.plate || '').trim() || transportId
  const itvExpiry = String(transport.itvExpiry || '').trim()
  if (!itvExpiry) return null

  const expiryDate = new Date(`${itvExpiry}T00:00:00`)
  if (Number.isNaN(expiryDate.getTime())) return null

  const diffDays = Math.round((expiryDate.getTime() - today.getTime()) / DAY_MS)
  if (diffDays > 7) return null

  const reminderDate = subtractDays(itvExpiry, 7)
  if (diffDays < 0) {
    return {
      family: 'itv',
      key: `itv-expired:${itvExpiry}`,
      type: 'itv_expired',
      title: `ITV pendent del vehicle ${plate}`,
      body: `${plate} te la ITV caducada des del ${formatDate(itvExpiry)}.`,
      notificationType: 'transport_itv_due',
      calendarDate: reminderDate,
      expiryDate: itvExpiry,
    }
  }

  return {
    family: 'itv',
    key: `itv-due:${itvExpiry}`,
    type: 'itv_due',
    title: `ITV propera del vehicle ${plate}`,
    body: `${plate} te la ITV pendent i caduca el ${formatDate(itvExpiry)}.`,
    notificationType: 'transport_itv_due',
    calendarDate: reminderDate,
    expiryDate: itvExpiry,
  }
}

async function publishRealtime(
  uids: string[],
  payload: { type: string; transportId: string; createdAt: number }
) {
  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey || !uids.length) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await Promise.all(
      uids.map((uid) =>
        rest.channels.get(`user:${uid}:notifications`).publish('created', payload)
      )
    )
  } catch (err) {
    console.error('[transportReviewNotifications] Ably publish error', err)
  }
}

async function sendPush(baseUrl: string, userId: string, title: string, body: string) {
  try {
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title,
        body,
        url: '/menu/logistica/transports',
      }),
    })
  } catch (err) {
    console.error('[transportReviewNotifications] push error', err)
  }
}

async function getTransportLeadUsers() {
  const snap = await db.collection('users').where('departmentLower', '==', 'logistica').get()
  return snap.docs
    .filter((doc) => {
      const data = doc.data() as {
        role?: string
        isTransportLead?: boolean
        email?: string
        name?: string
      }
      return normalizeRole(data.role) === 'cap' && data.isTransportLead === true
    })
    .map((doc) => {
      const data = doc.data() as { email?: string; name?: string }
      return {
        id: doc.id,
        email: String(data.email || '').trim(),
        name: String(data.name || '').trim(),
      }
    })
}

async function syncAlertForTransport(params: {
  transportId: string
  transport: TransportRecord
  alert: TransportAlert
  recipients: Array<{ id: string; email: string; name: string }>
  baseUrl: string
}) {
  const { transportId, transport, alert, recipients, baseUrl } = params
  const now = Date.now()
  const batch = db.batch()
  const nextReviewCalendarKeys = { ...(transport.lastReviewCalendarKeys || {}) }
  const nextItvCalendarKeys = { ...(transport.lastItvCalendarKeys || {}) }

  for (const recipient of recipients) {
    const notificationRef = db
      .collection('users')
      .doc(recipient.id)
      .collection('notifications')
      .doc(notificationDocId(alert.notificationType, transportId, recipient.id, alert.key))

    batch.set(
      notificationRef,
      {
        type: alert.notificationType,
        title: alert.title,
        body: alert.body,
        transportId,
        plate: transport.plate || null,
        reviewAlertType: alert.type,
        createdAt: now,
        read: false,
      },
      { merge: true }
    )

    if (!recipient.email) continue

    if (alert.family === 'review' && nextReviewCalendarKeys[recipient.id] !== alert.key) {
      try {
        await createTransportReviewCalendarEvent({
          assigneeEmail: recipient.email,
          plate: String(transport.plate || '').trim() || transportId,
          vehicleType: String(transport.type || '').trim(),
          reviewDate: alert.calendarDate,
          reviewReason: alert.type === 'km' ? 'km' : 'annual',
          notes: alert.body,
        })
        nextReviewCalendarKeys[recipient.id] = alert.key
      } catch (calendarError) {
        console.error('[transportReviewNotifications] review calendar error', calendarError)
      }
    }

    if (
      alert.family === 'itv' &&
      alert.expiryDate &&
      nextItvCalendarKeys[recipient.id] !== alert.key
    ) {
      try {
        await createTransportItvCalendarEvent({
          assigneeEmail: recipient.email,
          plate: String(transport.plate || '').trim() || transportId,
          vehicleType: String(transport.type || '').trim(),
          reminderDate: alert.calendarDate,
          expiryDate: alert.expiryDate,
        })
        nextItvCalendarKeys[recipient.id] = alert.key
      } catch (calendarError) {
        console.error('[transportReviewNotifications] itv calendar error', calendarError)
      }
    }
  }

  if (alert.family === 'review') {
    batch.set(
      db.collection('transports').doc(transportId),
      {
        lastReviewNotificationKey: alert.key,
        lastReviewNotificationAt: now,
        lastReviewNotificationType: alert.type,
        lastReviewCalendarKeys: nextReviewCalendarKeys,
      },
      { merge: true }
    )
  } else {
    batch.set(
      db.collection('transports').doc(transportId),
      {
        lastItvNotificationKey: alert.key,
        lastItvNotificationAt: now,
        lastItvNotificationType: alert.type,
        lastItvCalendarKeys: nextItvCalendarKeys,
      },
      { merge: true }
    )
  }

  await batch.commit()
  await publishRealtime(
    recipients.map((recipient) => recipient.id),
    {
      type: alert.notificationType,
      transportId,
      createdAt: now,
    }
  )
  await Promise.all(
    recipients.map((recipient) => sendPush(baseUrl, recipient.id, alert.title, alert.body))
  )

  return recipients.length
}

export async function processTransportReviewNotifications(baseUrl: string) {
  const recipients = await getTransportLeadUsers()
  if (!recipients.length) {
    return { scanned: 0, notified: 0, skipped: 'no_transport_leads' as const }
  }

  const transportsSnap = await db.collection('transports').get()
  const today = new Date()
  let notified = 0
  let scanned = 0

  for (const doc of transportsSnap.docs) {
    scanned += 1
    const data = doc.data() as TransportRecord
    const alerts = [buildReviewAlert(doc.id, data, today), buildItvAlert(doc.id, data, today)].filter(
      (alert): alert is TransportAlert => Boolean(alert)
    )

    for (const alert of alerts) {
      if (alert.family === 'review' && data.lastReviewNotificationKey === alert.key) continue
      if (alert.family === 'itv' && data.lastItvNotificationKey === alert.key) continue

      notified += await syncAlertForTransport({
        transportId: doc.id,
        transport: data,
        alert,
        recipients,
        baseUrl,
      })

      if (alert.family === 'review') {
        data.lastReviewNotificationKey = alert.key
      } else {
        data.lastItvNotificationKey = alert.key
      }
    }
  }

  return { scanned, notified }
}
