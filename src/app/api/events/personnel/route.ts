// src/app/api/events/personnel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { QuerySnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

// Helpers
const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string | null) => unaccent(String(s || '')).toLowerCase().trim()
const dayKey = (iso?: string | null) => (iso || '').slice(0, 10)
const uniqBy = <T, K extends string | number>(arr: T[], key: (x: T) => K) => {
  const m = new Map<K, T>()
  for (const it of arr) m.set(key(it), it)
  return Array.from(m.values())
}
const chunk = <T>(arr: T[], size = 10) => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Tipus
type QRow = {
  department?: string
  code?: string
  eventId?: string
  eventName?: string
  startDate?: string
  meetingPoint?: string
  startTime?: string
  endTime?: string
  hour?: string
  convocatoria?: string
  responsableName?: string
  conductors?: Array<{
    name?: string
    meetingPoint?: string
    time?: string
    hour?: string
    endTime?: string
    endTimeReal?: string
    sortidaNotes?: string
    noShow?: boolean
    leftEarly?: boolean
    plate?: string
    matricula?: string
    vehiclePlate?: string
  }>
  treballadors?: Array<{
    name?: string
    meetingPoint?: string
    time?: string
    hour?: string
    endTime?: string
    endTimeReal?: string
    sortidaNotes?: string
    noShow?: boolean
    leftEarly?: boolean
  }>
  workers?: Array<{
    name?: string
    meetingPoint?: string
    time?: string
    hour?: string
    endTime?: string
    endTimeReal?: string
    sortidaNotes?: string
    noShow?: boolean
    leftEarly?: boolean
  }>
}

type PersonnelDoc = {
  name?: string
  phone?: string
  mobile?: string
  tel?: string
  telephone?: string
}

type QuadrantLinePerson = {
  name?: string
  meetingPoint?: string
  time?: string
  hour?: string
  endTime?: string
  endTimeReal?: string
  sortidaNotes?: string
  noShow?: boolean
  leftEarly?: boolean
  plate?: string
  matricula?: string
  vehiclePlate?: string
}

type PersonnelListEntry = {
  name: string
  role: string
  department?: string
  meetingPoint?: string
  time?: string
  endTime?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
  plate?: string
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const eventId = url.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'Falta eventId' }, { status: 400 })
    }

    /* ────────────────────────────────────────────────
       1) BUSCAR L’ESDEVENIMENT A FIRESTORE (3 col·leccions)
       stage_verd / stage_taronja / stage_taronja
    ──────────────────────────────────────────────── */
    const eventCollections = ['stage_verd', 'stage_taronja', 'stage_taronja']

    let eventData: Record<string, unknown> | null = null
    for (const coll of eventCollections) {
      const snap = await firestoreAdmin.collection(coll).doc(eventId).get()
      if (snap.exists) {
        eventData = snap.data() ?? null
        break
      }
    }

    if (!eventData) {
      return NextResponse.json(
        { error: 'Esdeveniment no trobat al Firestore' },
        { status: 404 }
      )
    }

    // Normalitzar camps per evitar NaN o undefined
    const code = String(eventData.code ?? '')
    const name = String(eventData.name ?? eventData.eventName ?? '')
    const startDateRaw = eventData.startDate
    const dateKeyValue = dayKey(typeof startDateRaw === 'string' ? startDateRaw : null)
    const eventNameNorm = norm(name)

    /* ────────────────────────────────────────────────
       2) LLEGIR QUADRANTS DE TOTS ELS DEPARTAMENTS
    ──────────────────────────────────────────────── */
    const quadrantCollections = [
      'quadrantsServeis',
      'quadrantsLogistica',
      'quadrantsCuina',
      'quadrantsProduccio',
      'quadrantsComercial',
    ]

    const rows: QRow[] = []

    for (const coll of quadrantCollections) {
      const ref = firestoreAdmin.collection(coll)

      const byId = await ref.where('eventId', '==', eventId).get().catch(() => null)
      const byCode =
        code
          ? await ref.where('code', '==', code).get().catch(() => null)
          : null
      const byDate =
        dateKeyValue
          ? await ref.where('startDate', '==', dateKeyValue).get().catch(() => null)
          : null

      const push = (snap: QuerySnapshot | null) => {
        if (snap && !snap.empty) {
          snap.forEach((d) => rows.push(d.data() as QRow))
        }
      }

      push(byId)
      push(byCode)
      push(byDate)
    }

    /* ────────────────────────────────────────────────
       3) FILTRAR QUADRANTS COINCIDENTS AMB L’ESDEVENIMENT
    ──────────────────────────────────────────────── */
    const normCode = (s?: string | null) =>
      (s ? unaccent(String(s)).toLowerCase().trim().replace(/\s+/g, '') : '')

    const filtered = rows.filter((r) => {
      if (r.eventId === eventId) return true
      if (code && r.code && normCode(r.code) === normCode(code)) return true
      if (r.eventName && norm(r.eventName) === eventNameNorm) return true
      return false
    })

    /* ────────────────────────────────────────────────
       4) GENERAR PERSONES (responsables / conductors / treballadors)
    ──────────────────────────────────────────────── */
    const people: PersonnelListEntry[] = []

    for (const q of filtered) {
      const dept = q.department
      const qMeeting = q.meetingPoint
      const qTime = q.startTime || q.hour || q.convocatoria

      if (q.responsableName) {
        people.push({
          name: q.responsableName,
          role: 'responsable',
          department: dept,
          meetingPoint: qMeeting,
          time: qTime,
        })
      }

      const each = (arr: QuadrantLinePerson[] | undefined, role: string) => {
        if (!Array.isArray(arr)) return
        for (const p of arr) {
          const name = (p?.name || '').trim()
          if (!name) continue
          const plate =
            role === 'conductor'
              ? String(p.plate || p.matricula || p.vehiclePlate || '')
              : ''
          people.push({
            name,
            role,
            department: dept,
            meetingPoint: p.meetingPoint || qMeeting,
            time: p.time || p.hour || qTime,
            endTime: p.endTime || q.endTime || '',
            endTimeReal: p.endTimeReal || '',
            notes: p.sortidaNotes || '',
            noShow: !!p.noShow,
            leftEarly: !!p.leftEarly,
            ...(plate ? { plate: String(plate) } : {}),
          })
        }
      }

      each(q.conductors, 'conductor')
      each(q.treballadors, 'treballador')
      each(q.workers, 'treballador')
    }

    const dedup = uniqBy(people, (p) => `${p.name}|${p.role}`)

    /* ────────────────────────────────────────────────
       5) OBTENIR TELÈFONS (personnel > users)
    ──────────────────────────────────────────────── */
    const names = Array.from(new Set(dedup.map((p) => p.name)))
    const nameChunks = chunk(names, 10)
    const phoneMap = new Map<string, string>()

    for (const chunkGroup of nameChunks) {
      const snap = await firestoreAdmin
        .collection('personnel')
        .where('name', 'in', chunkGroup)
        .get()
        .catch(() => null)

      if (snap && !snap.empty) {
        snap.forEach((doc) => {
          const d = doc.data() as PersonnelDoc
          const phone = d.phone || d.mobile || d.tel || d.telephone
          if (d.name && phone) phoneMap.set(String(d.name), String(phone))
        })
      }
    }

    for (const chunkGroup of nameChunks) {
      const missing = chunkGroup.filter((n) => !phoneMap.has(n))
      if (missing.length === 0) continue

      const snap = await firestoreAdmin
        .collection('users')
        .where('name', 'in', missing)
        .get()
        .catch(() => null)

      if (snap && !snap.empty) {
        snap.forEach((doc) => {
          const d = doc.data() as PersonnelDoc
          const phone = d.phone || d.mobile || d.tel || d.telephone
          if (d.name && phone) phoneMap.set(String(d.name), String(phone))
        })
      }
    }

    const withPhones = dedup.map((p) => ({ ...p, phone: phoneMap.get(p.name) }))

    /* ────────────────────────────────────────────────
       6) RETORN FINAL
    ──────────────────────────────────────────────── */
    return NextResponse.json({
      event: {
        id: eventId,
        code,
        name,
        date: dateKeyValue,
        location: String(eventData.location ?? ''),
      },
      responsables: withPhones.filter((p) => p.role === 'responsable'),
      conductors: withPhones.filter((p) => p.role === 'conductor'),
      treballadors: withPhones.filter((p) => p.role === 'treballador'),
    })
  } catch (err: unknown) {
    console.error('[api/events/personnel] error', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
