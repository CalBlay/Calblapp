// file: src/app/api/quadrantsDraft/confirm/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import { requireAuth } from '@/lib/server/apiAuth'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import { ensureEventChatChannel } from '@/lib/messaging/eventChat'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { listAllCollectionIds } from '@/lib/firestoreCollections'
import { findQuadrantOverlapConflicts } from '@/lib/quadrantOverlapGuard'
import { formatTornNotificationLabel } from '@/lib/date-format'
import { resolveEventDisplayName } from '@/lib/eventDisplayName'
import {
  assignmentsByDocId,
  buildQuadrantNotificationPlan,
  type QuadrantNotificationDoc,
} from '@/lib/quadrantNotificationAssignments'

export const runtime = 'nodejs'

/* ------------------ Tipus ------------------ */
interface QuadrantDoc {
  status?: string
  eventName?: string
  summary?: string
  responsable?: { id?: string; name?: string }
  responsableName?: string
  responsableId?: string
  responsables?: Array<{ id?: string; name?: string }>
  conductors?: Array<{ id?: string; name?: string }>
  treballadors?: Array<{ id?: string; name?: string }>
  numDrivers?: number
  totalWorkers?: number
  startDate?: string
  meetingPoint?: string
  distanceKm?: number
}

type AssignedUser = {
  id?: string
  name?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  meetingPoint?: string
  vehicleType?: string
  plate?: string
}

type TokenLike = {
  user?: { email?: string }
  email?: string
}

type EventStageData = Record<string, unknown>

/* ------------------ Utils ------------------ */
const norm = (v?: string) =>
  (v || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()
const canonicalCollectionFor = (dept: string) => `quadrants${capitalize(norm(dept))}`

async function resolveDeptCollection(dept: string) {
  const key = norm(dept)
  const cols = await listAllCollectionIds()
  for (const id of cols) {
    const plain = id
      .replace(/^quadrants?/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
    if (plain === key) return id
  }
  return canonicalCollectionFor(dept)
}

async function lookupUidForAssigned(user: AssignedUser): Promise<string | null> {
  const rawId = String(user?.id || '').trim()
  if (!rawId) return null

  const direct = await db.collection('users').doc(rawId).get()
  if (direct.exists) return rawId

  const q = await db.collection('users').where('userId', '==', rawId).limit(1).get()
  if (!q.empty) return q.docs[0].id

  return null
}

async function lookupUidByName(name?: string): Promise<string | null> {
  const rawName = String(name || '').trim()
  if (!rawName) return null

  // 1) Try users by name
  let q = await db.collection('users').where('name', '==', rawName).limit(1).get()
  if (!q.empty) return q.docs[0].id

  // 2) Try personnel by name -> use doc id to find user
  q = await db.collection('personnel').where('name', '==', rawName).limit(1).get()
  if (!q.empty) {
    const personId = q.docs[0].id
    const byId = await lookupUidForAssigned({ id: personId })
    if (byId) return byId
  }

  const nameFold = norm(rawName).replace(/\s+/g, ' ')
  q = await db.collection('users').where('nameFold', '==', nameFold).limit(1).get()
  if (!q.empty) return q.docs[0].id

  q = await db.collection('personnel').where('nameFold', '==', nameFold).limit(1).get()
  if (!q.empty) {
    const byId = await lookupUidForAssigned({ id: q.docs[0].id })
    if (byId) return byId
  }

  return null
}

async function resolveUid(user: AssignedUser): Promise<string | null> {
  const byId = await lookupUidForAssigned(user)
  if (byId) return byId
  return lookupUidByName(user?.name)
}

async function resolveUids(users: AssignedUser[]): Promise<string[]> {
  if (!users.length) return []
  const raw = await Promise.all(users.map(u => resolveUid(u)))
  return Array.from(new Set(raw.filter(Boolean) as string[]))
}

async function sendPushToUids(params: {
  uids: string[]
  title: string
  body: string
  url: string
}) {
  const { uids, title, body, url } = params
  const results = await sendPushToUsers(uids, { title, body, url })
  const sent = results.reduce((total, result) => total + result.sent, 0)
  const failed = results.filter((result) => !result.success).length
  const skipped = results.filter((result) => result.skipped).length
  const summary = { recipients: uids.length, sent, failed, skipped }
  if (sent > 0) {
    console.info('[quadrantsDraft/confirm] push dispatched', summary)
  } else {
    console.warn('[quadrantsDraft/confirm] push dispatched with zero deliveries', summary)
  }
}

async function createTornNotifications(params: {
  uids: string[]
  title: string
  body: string
  eventId: string
  eventDate?: string
  eventName?: string
}) {
  const { uids, title, body, eventId, eventDate, eventName } = params
  if (!uids.length) return

  const batch = db.batch()
  const now = Date.now()

  for (const uid of uids) {
    const notifRef = db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .doc()

    batch.set(notifRef, {
      title,
      body,
      createdAt: now,
      read: false,
      type: 'torn',
      eventId,
      eventDate: eventDate || null,
      eventName: eventName || null,
    })
  }

  await batch.commit()
  const { afterNotificationsCommitted } = await import('@/lib/notifications/writeUserNotification')
  await afterNotificationsCommitted(uids.map((uid) => ({ userId: uid, type: 'torn' })))

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const { getAblyRest } = await import('@/lib/server/ablyRest')
    const rest = getAblyRest()
    await Promise.all(
      uids.map(uid =>
        rest.channels
          .get(`user:${uid}:notifications`)
          .publish('created', { type: 'torn', eventId, eventDate: eventDate || null, createdAt: now })
      )
    )
  } catch (err) {
    console.error('[quadrantsDraft/confirm] Ably publish error', err)
  }
}

/* ------------------ Handler ------------------ */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canView = await canViewUiPath({ user: auth.user, path: '/menu/quadrants' })
    if (!canView) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    const canConfirm = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/quadrants', 'draft:confirm'),
    })
    if (canConfirm !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const deptRaw: string = body?.department || body?.dept
    const eventId: string = normalizeEventId(body?.eventId || body?.id)

    if (!deptRaw || !eventId) {
      return NextResponse.json({ ok: false, error: 'Missing department or eventId' }, { status: 400 })
    }

    const dept = norm(deptRaw)
    const colName = await resolveDeptCollection(dept)
    const collection = db.collection(colName)
    const directRef = collection.doc(String(eventId))
    const directSnap = await directRef.get()
    const byEvent = await collection.where('eventId', '==', String(eventId)).get()
    const eventSnap = await db.collection('stage_verd').doc(String(eventId)).get()
    const eventData = eventSnap.exists ? (eventSnap.data() as EventStageData) : null

    const targetDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot>()
    if (directSnap.exists) targetDocs.set(directSnap.id, directSnap)
    byEvent.docs.forEach((doc) => targetDocs.set(doc.id, doc))

    const prevDocs = Array.from(targetDocs.values())
    const overlapAssignments = prevDocs.flatMap((doc) => {
      if (!doc.exists) return []
      const data = doc.data() as QuadrantDoc & {
        endDate?: string
        startTime?: string
        endTime?: string
      }
      const assignments: Array<{
        id?: string | null
        name?: string | null
        startDate: string
        endDate?: string | null
        startTime?: string | null
        endTime?: string | null
      }> = []
      const push = (entry: {
        id?: string | null
        name?: string | null
        startDate?: string | null
        endDate?: string | null
        startTime?: string | null
        endTime?: string | null
      }) => {
        const id = String(entry.id || '').trim()
        const name = String(entry.name || '').trim()
        const startDate = String(entry.startDate || data.startDate || '').trim()
        const endDate = String(entry.endDate || data.endDate || startDate).trim()
        const startTime = String(entry.startTime || data.startTime || '00:00').trim() || '00:00'
        const endTime = String(entry.endTime || data.endTime || '23:59').trim() || '23:59'
        if ((!id && !name) || !startDate || !endDate) return
        assignments.push({ id: id || null, name: name || null, startDate, endDate, startTime, endTime })
      }
      push({ id: data.responsableId, name: data.responsableName })
      ;(Array.isArray(data.responsables) ? data.responsables : []).forEach((line) => push(line))
      ;(Array.isArray(data.conductors) ? data.conductors : []).forEach((line) => push(line))
      ;(Array.isArray(data.treballadors) ? data.treballadors : []).forEach((line) => push(line))
      return assignments
    })
    const overlapConflicts = await findQuadrantOverlapConflicts({
      assignments: overlapAssignments,
      excludeDocIds: Array.from(targetDocs.keys()),
    })
    if (overlapConflicts.length > 0) {
      const first = overlapConflicts[0]
      return NextResponse.json(
        {
          ok: false,
          error: `No es pot confirmar: ${first.personLabel} ja està assignat a ${first.source.eventId || first.source.docId} (${first.busy.startDate} ${first.busy.startTime}-${first.busy.endTime}).`,
          conflicts: overlapConflicts,
        },
        { status: 409 }
      )
    }
    const already = prevDocs.length > 0 && prevDocs.every((doc) => {
      const data = doc.data() as QuadrantDoc | undefined
      return data?.status === 'confirmed'
    })

    // 2) Confirmar
    const now = new Date()
    const updatePayload: FirebaseFirestore.DocumentData = {
      status: 'confirmed',
      confirmedAt: now,
      confirmedBy:
        (token as TokenLike)?.user?.email ||
        (token as TokenLike)?.email ||
        'system',
    }
    if (body.service !== undefined && body.service !== '') {
      updatePayload.service = body.service
    }
    if (targetDocs.size === 0) {
      await directRef.set(updatePayload, { merge: true })
    } else {
      const batch = db.batch()
      targetDocs.forEach((doc) => {
        batch.set(doc.ref, updatePayload, { merge: true })
      })
      await batch.commit()
    }

    try {
      await ensureEventChatChannel(String(eventId))
    } catch {
      // ignore chat creation errors
    }

    // 3) Avisos intel·ligents
    const currentDocsSnap =
      targetDocs.size === 0
        ? [await directRef.get()]
        : await Promise.all(Array.from(targetDocs.values()).map((doc) => doc.ref.get()))
    const currentDocs = currentDocsSnap.filter((doc) => doc.exists)

    const notificationDocs = currentDocs.map((doc) => ({
      docId: doc.id,
      doc: doc.data() as QuadrantNotificationDoc,
    }))
    const notificationPlan = buildQuadrantNotificationPlan(notificationDocs)
    const notificationAssignmentsByDocId = assignmentsByDocId(
      notificationPlan.currentAssignments
    )
    if (notificationDocs.length > 0) {
      const snapshotBatch = db.batch()
      notificationDocs.forEach(({ docId }) => {
        snapshotBatch.set(
          collection.doc(docId),
          {
            quadrantNotificationAssignments:
              notificationAssignmentsByDocId[docId] || [],
          },
          { merge: true }
        )
      })
      await snapshotBatch.commit()
    }

    const mainDoc = (currentDocs[0]?.data() as QuadrantDoc | undefined) || {}
    const eventName =
      resolveEventDisplayName(eventData, mainDoc.eventName, mainDoc.summary) ||
      'Nou esdeveniment'
    const notificationBody = formatTornNotificationLabel(eventName, mainDoc.startDate)

    const affectedUsers: AssignedUser[] = notificationPlan.recipients.map((recipient) => ({
      id: recipient.personId || undefined,
      name: recipient.name,
    }))
    const uids = await resolveUids(affectedUsers)
    if (affectedUsers.length > 0 && uids.length === 0) {
      console.warn('[quadrantsDraft/confirm] no app users resolved for affected assignments', {
        eventId,
        affectedAssignments: affectedUsers.length,
        assignmentsWithId: affectedUsers.filter((user) => user.id).length,
      })
    }
    if (notificationPlan.kind === 'first_confirmation') {
      await createTornNotifications({
        uids,
        title: 'Tens un nou torn assignat',
        body: notificationBody,
        eventId: String(eventId),
        eventDate: mainDoc.startDate || undefined,
        eventName,
      })
      await sendPushToUids({
        uids,
        title: 'Tens un nou torn assignat',
        body: notificationBody,
        url: `/menu/torns?open=${eventId}`,
      })
    } else if (affectedUsers.length > 0) {
      await createTornNotifications({
        uids,
        title: 'Tens canvis al teu torn',
        body: notificationBody,
        eventId: String(eventId),
        eventDate: mainDoc.startDate || undefined,
        eventName,
      })
      await sendPushToUids({
        uids,
        title: 'Tens canvis al teu torn',
        body: notificationBody,
        url: `/menu/torns?open=${eventId}`,
      })
    }

    revalidateQuadrantsListCache()
    return NextResponse.json({ ok: true, already })
  } catch (e) {
    console.error('[quadrantsDraft/confirm] error', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
