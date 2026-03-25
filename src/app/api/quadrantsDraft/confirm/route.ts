// file: src/app/api/quadrantsDraft/confirm/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import { ensureEventChatChannel } from '@/lib/messaging/eventChat'

export const runtime = 'nodejs'
const ORIGIN = 'Molí Vinyals, 11, 08776 Sant Pere de Riudebitlles, Barcelona'
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

/* ------------------ Tipus ------------------ */
interface QuadrantDoc {
  status?: string
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

/* ------------------ Utils ------------------ */
const norm = (v?: string) =>
  (v || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

async function calcDistanceKm(destination: string): Promise<number | null> {
  if (!GOOGLE_KEY || !destination) return null
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', ORIGIN)
    url.searchParams.set('destinations', destination)
    url.searchParams.set('key', GOOGLE_KEY)
    url.searchParams.set('mode', 'driving')

    const res = await fetch(url.toString())
    if (!res.ok) return null
    const json = await res.json()
    const el = json?.rows?.[0]?.elements?.[0]
    if (el?.status !== 'OK') return null
    const meters = el.distance?.value
    if (!meters) return null
    return (meters / 1000) * 2 // anada + tornada
  } catch (err) {
    console.warn('[quadrantsDraft/confirm] distance error', err)
    return null
  }
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
    const userDoc = await db.collection('users').doc(personId).get()
    if (userDoc.exists) return userDoc.id
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
  baseUrl: string
  uids: string[]
  title: string
  body: string
  url: string
}) {
  const { baseUrl, uids, title, body, url } = params
  if (!uids.length) return

  await Promise.all(
    uids.map(uid =>
      fetch(`${baseUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, title, body, url }),
      }).catch(() => {})
    )
  )
}

async function createTornNotifications(params: {
  uids: string[]
  title: string
  body: string
  eventId: string
  eventDate?: string
}) {
  const { uids, title, body, eventId, eventDate } = params
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
    })
  }

  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
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
    const colName = `quadrants${capitalize(dept)}`
    const collection = db.collection(colName)
    const directRef = collection.doc(String(eventId))
    const directSnap = await directRef.get()
    const byEvent = await collection.where('eventId', '==', String(eventId)).get()

    const targetDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot>()
    if (directSnap.exists) targetDocs.set(directSnap.id, directSnap)
    byEvent.docs.forEach((doc) => targetDocs.set(doc.id, doc))

    const prevDocs = Array.from(targetDocs.values())
    const prev = prevDocs[0]?.exists ? (prevDocs[0].data() as QuadrantDoc) : null
    const already = prevDocs.length > 0 && prevDocs.every((doc) => {
      const data = doc.data() as QuadrantDoc | undefined
      return data?.status === 'confirmed'
    })

    // 2) Confirmar
    const now = new Date()
    const updatePayload: Record<string, any> = {
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

    // Distància: sempre intentem recalcular amb l'adreça actual
    const evSnap = await db.collection('stage_verd').doc(String(eventId)).get()
    const ev = evSnap.data() as any
    const destination = ev?.Ubicacio || ev?.location || ev?.address || ''
    const km = await calcDistanceKm(destination)
    if (km) {
      if (targetDocs.size === 0) {
        await directRef.set({ distanceKm: km, distanceCalcAt: new Date() }, { merge: true })
      } else {
        const batch = db.batch()
        targetDocs.forEach((doc) => {
          batch.set(doc.ref, { distanceKm: km, distanceCalcAt: new Date() }, { merge: true })
        })
        await batch.commit()
      }
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

    const extract = (q?: QuadrantDoc) => {
      if (!q) return []
      const arr: AssignedUser[] = []
      const pushUser = (src: any, fallbackName?: string) => {
        const name = String(fallbackName || src?.name || '').trim()
        const id = String(src?.id || src?.userId || src?.personId || '').trim()
        if (!name && !id) return
        arr.push({
          id: id || undefined,
          name,
          startDate: src.startDate,
          startTime: src.startTime,
          endDate: src.endDate,
          endTime: src.endTime,
          meetingPoint: src.meetingPoint,
          vehicleType: src.vehicleType,
          plate: src.plate,
        })
      }
      const respFallback = q.responsable || {
        id: q.responsableId,
        name: q.responsableName,
      }
      if (respFallback?.name || respFallback?.id) {
        pushUser(respFallback, respFallback.name)
      }
      ;(q.responsables || []).forEach(r => pushUser(r, r?.name))
      ;(q.conductors || []).forEach(c => pushUser(c, c?.name))
      ;(q.treballadors || []).forEach(t => pushUser(t, t?.name))
      return arr
    }

    const oldUsers = prevDocs.flatMap((doc) => extract(doc.exists ? (doc.data() as QuadrantDoc) : undefined))
    const newUsers = currentDocs.flatMap((doc) => extract(doc.exists ? (doc.data() as QuadrantDoc) : undefined))
    const isFirstConfirm = !prev?.status || prev?.status !== 'confirmed'
    let changed = newUsers
    if (!isFirstConfirm) {
      changed = newUsers.filter(nu => {
        const old = nu.id
          ? oldUsers.find(ou => ou.id === nu.id)
          : oldUsers.find(ou => ou.name === nu.name)
        if (!old) return true
        return (
          old.startDate !== nu.startDate ||
          old.startTime !== nu.startTime ||
          old.endDate !== nu.endDate ||
          old.endTime !== nu.endTime ||
          old.meetingPoint !== nu.meetingPoint ||
          old.vehicleType !== nu.vehicleType ||
          old.plate !== nu.plate
        )
      })
    }

    const eventName =
      ev?.eventName ||
      ev?.Nom ||
      ev?.name ||
      'Nou esdeveniment'
    const mainDoc = (currentDocs[0]?.data() as QuadrantDoc | undefined) || {}
    const when = mainDoc.startDate ? ` ${mainDoc.startDate}` : ''

    if (isFirstConfirm) {
      const uids = await resolveUids(newUsers)
      await createTornNotifications({
        uids,
        title: 'Tens un nou torn assignat',
        body: `${eventName}${when}`,
        eventId: String(eventId),
        eventDate: mainDoc.startDate || undefined,
      })
      await sendPushToUids({
        baseUrl: req.nextUrl.origin,
        uids,
        title: 'Tens un nou torn assignat',
        body: `${eventName}${when}`,
        url: `/menu/torns?open=${eventId}`,
      })
    } else if (changed.length > 0) {
      const uids = await resolveUids(changed)
      await createTornNotifications({
        uids,
        title: 'Tens canvis al teu torn',
        body: `${eventName}${when}`,
        eventId: String(eventId),
        eventDate: mainDoc.startDate || undefined,
      })
      await sendPushToUids({
        baseUrl: req.nextUrl.origin,
        uids,
        title: 'Tens canvis al teu torn',
        body: `${eventName}${when}`,
        url: `/menu/torns?open=${eventId}`,
      })
    }

    return NextResponse.json({ ok: true, already })
  } catch (e) {
    console.error('[quadrantsDraft/confirm] error', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
