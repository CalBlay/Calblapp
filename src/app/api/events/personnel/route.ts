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
  status?: string
  startDate?: string
  meetingPoint?: string
  startTime?: string
  endTime?: string
  updatedAt?: unknown
  confirmedAt?: unknown
  createdAt?: unknown
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
  sourceUpdatedAt: number
}

const rolePriority = (role?: string) => {
  if (role === 'responsable') return 3
  if (role === 'conductor') return 2
  return 1
}

const toMillis = (value: unknown) => {
  if (!value) return 0
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime()
  }
  return 0
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const eventId = url.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'Falta eventId' }, { status: 400 })
    }

    /* ────────────────────────────────────────────────
       1) BUSCAR L'ESDEVENIMENT A FIRESTORE (paral·lel)
    ──────────────────────────────────────────────── */
    const eventCollections = ['stage_verd', 'stage_taronja'] as const

    const eventSnaps = await Promise.all(
      eventCollections.map((coll) =>
        firestoreAdmin.collection(coll).doc(eventId).get()
      )
    )
    const eventData: Record<string, unknown> | null =
      eventSnaps.find((s) => s.exists)?.data() ?? null

    if (!eventData) {
      return NextResponse.json(
        { error: 'Esdeveniment no trobat al Firestore' },
        { status: 404 }
      )
    }

    const code = String(eventData.code ?? '')
    const name = String(eventData.name ?? eventData.eventName ?? '')
    const startDateRaw = eventData.startDate
    const dateKeyValue = dayKey(typeof startDateRaw === 'string' ? startDateRaw : null)
    const eventNameNorm = norm(name)

    /* ────────────────────────────────────────────────
       2) LLEGIR QUADRANTS (5 col·leccions, totes en paral·lel)
       Estrategia: prioritzar query per eventId (la mes especifica).
       Si no troba res, fer fallback a code i a startDate.
    ──────────────────────────────────────────────── */
    const quadrantCollections = [
      'quadrantsServeis',
      'quadrantsLogistica',
      'quadrantsCuina',
      'quadrantsProduccio',
      'quadrantsComercial',
    ]

    const pushSnap = (snap: QuerySnapshot | null, target: QRow[]) => {
      if (!snap || snap.empty) return
      snap.forEach((d) => {
        const data = d.data() as QRow
        target.push({
          ...data,
          status: String(data?.status || ''),
          updatedAt: data?.updatedAt,
          confirmedAt: data?.confirmedAt,
          createdAt: data?.createdAt,
        })
      })
    }

    const fetchPerCollection = async (coll: string): Promise<QRow[]> => {
      const ref = firestoreAdmin.collection(coll)
      const acc: QRow[] = []

      // 1ª passada: query mes selectiva (eventId).
      const byIdSnap = await ref
        .where('eventId', '==', eventId)
        .get()
        .catch(() => null)
      pushSnap(byIdSnap, acc)
      if (acc.length > 0) return acc

      // 2ª passada nomes si no s'han trobat docs: code + startDate en paral·lel.
      const [byCode, byDate] = await Promise.all([
        code
          ? ref.where('code', '==', code).get().catch(() => null)
          : Promise.resolve(null),
        dateKeyValue
          ? ref.where('startDate', '==', dateKeyValue).get().catch(() => null)
          : Promise.resolve(null),
      ])
      pushSnap(byCode, acc)
      pushSnap(byDate, acc)
      return acc
    }

    const collectionResults = await Promise.all(
      quadrantCollections.map((coll) => fetchPerCollection(coll))
    )
    const rows: QRow[] = collectionResults.flat()

    /* ────────────────────────────────────────────────
       3) FILTRAR QUADRANTS COINCIDENTS AMB L’ESDEVENIMENT
    ──────────────────────────────────────────────── */
    const normCode = (s?: string | null) =>
      (s ? unaccent(String(s)).toLowerCase().trim().replace(/\s+/g, '') : '')

    const filtered = rows
      .filter((r) => {
      if (r.eventId === eventId) return true
      if (code && r.code && normCode(r.code) === normCode(code)) return true
      if (r.eventName && norm(r.eventName) === eventNameNorm) return true
      return false
      })
      .sort((a, b) => {
        const aTs = toMillis(a.updatedAt) || toMillis(a.confirmedAt) || toMillis(a.createdAt)
        const bTs = toMillis(b.updatedAt) || toMillis(b.confirmedAt) || toMillis(b.createdAt)
        return bTs - aTs
      })

    /* ────────────────────────────────────────────────
       4) GENERAR PERSONES (responsables / conductors / treballadors)
    ──────────────────────────────────────────────── */
    const people: PersonnelListEntry[] = []

    for (const q of filtered) {
      const dept = q.department
      const qMeeting = q.meetingPoint
      const qTime = q.startTime || q.hour || q.convocatoria
      const sourceUpdatedAt =
        toMillis(q.updatedAt) || toMillis(q.confirmedAt) || toMillis(q.createdAt)

      if (q.responsableName) {
        people.push({
          name: q.responsableName,
          role: 'responsable',
          department: dept,
          meetingPoint: qMeeting,
          time: qTime,
          sourceUpdatedAt,
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
            sourceUpdatedAt,
            ...(plate ? { plate: String(plate) } : {}),
          })
        }
      }

      each(q.conductors, 'conductor')
      each(q.treballadors, 'treballador')
      each(q.workers, 'treballador')
    }

    const dedupMap = new Map<string, PersonnelListEntry>()
    people.forEach((person) => {
      const key = `${norm(person.department)}|${norm(person.name)}`
      const existing = dedupMap.get(key)
      if (!existing) {
        dedupMap.set(key, person)
        return
      }

      if (person.sourceUpdatedAt > existing.sourceUpdatedAt) {
        dedupMap.set(key, person)
        return
      }

      if (
        person.sourceUpdatedAt === existing.sourceUpdatedAt &&
        rolePriority(person.role) > rolePriority(existing.role)
      ) {
        dedupMap.set(key, person)
      }
    })

    const dedup = Array.from(dedupMap.values())

    /* ────────────────────────────────────────────────
       5) OBTENIR TELÈFONS (personnel > users)
    ──────────────────────────────────────────────── */
    const names = Array.from(new Set(dedup.map((p) => p.name)))
    const nameChunks = chunk(names, 10)
    const phoneMap = new Map<string, string>()

    const personnelSnaps = await Promise.all(
      nameChunks.map((chunkGroup) =>
        firestoreAdmin
          .collection('personnel')
          .where('name', 'in', chunkGroup)
          .get()
          .catch(() => null)
      )
    )
    personnelSnaps.forEach((snap) => {
      if (!snap || snap.empty) return
      snap.forEach((doc) => {
        const d = doc.data() as PersonnelDoc
        const phone = d.phone || d.mobile || d.tel || d.telephone
        if (d.name && phone) phoneMap.set(String(d.name), String(phone))
      })
    })

    const missingChunks = nameChunks
      .map((chunkGroup) => chunkGroup.filter((n) => !phoneMap.has(n)))
      .filter((chunkGroup) => chunkGroup.length > 0)

    const userSnaps = await Promise.all(
      missingChunks.map((chunkGroup) =>
        firestoreAdmin
          .collection('users')
          .where('name', 'in', chunkGroup)
          .get()
          .catch(() => null)
      )
    )
    userSnaps.forEach((snap) => {
      if (!snap || snap.empty) return
      snap.forEach((doc) => {
        const d = doc.data() as PersonnelDoc
        const phone = d.phone || d.mobile || d.tel || d.telephone
        if (d.name && phone) phoneMap.set(String(d.name), String(phone))
      })
    })

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
