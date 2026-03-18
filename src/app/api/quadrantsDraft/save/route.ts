// src/app/api/quadrantsDraft/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
const ORIGIN = 'Molí Vinyals, 11, 08776 Sant Pere de Riudebitlles, Barcelona'
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

// Normalitza: "logística" -> "logistica"
const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

// Si no trobem col·lecció existent, fem un nom canònic
const canonicalCollectionFor = (dept: string) => {
  const key = norm(dept)
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1)
  return `quadrants${capitalized}` // ex: quadrantsLogistica
}

async function resolveDeptCollection(dept: string): Promise<string> {
  const key = norm(dept)
  const cols = await db.listCollections()

  for (const c of cols) {
    const plain = c.id
      .replace(/^quadrants/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()

    if (plain === key) return c.id
  }

  // Fallback canònic (no cal que existeixi prèviament)
  return canonicalCollectionFor(dept)
}

// ✅ Ara incloem també 'brigada'
type Role = 'responsable' | 'conductor' | 'treballador' | 'brigada'

interface RowInput {
  role: Role
  id: string
  name: string
  isDriver?: boolean
  groupId?: string
  meetingPoint?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  vehicleType?: string
  plate?: string
  arrivalTime?: string
  workers?: number // només per brigades
}

interface GroupInput {
  id?: string | null
  serviceDate?: string | null
  dateLabel?: string | null
  meetingPoint?: string
  startTime?: string
  arrivalTime?: string | null
  endTime?: string
  workers?: number
  drivers?: number
  needsDriver?: boolean
  driverId?: string | null
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
}

type Line = {
  id: string
  name: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  arrivalTime: string
  vehicleType: string
  plate: string
}

type BrigadeLine = Line & {
  workers: number
}

const toLine = (p: RowInput): Line => ({
  id: p?.id || '',
  name: p?.name || '',
  meetingPoint: p?.meetingPoint || '',
  startDate: p?.startDate || '',
  startTime: p?.startTime || '',
  endDate: p?.endDate || '',
  endTime: p?.endTime || '',
  arrivalTime: p?.arrivalTime || '',
  vehicleType: p?.vehicleType || '',
  plate: p?.plate || '',
})

const toBrigadeLine = (p: RowInput): BrigadeLine => ({
  ...toLine(p),
  workers: typeof p?.workers === 'number' ? p.workers : 0,
})

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
    return (meters / 1000) * 2 // anada+tornada
  } catch (err) {
    console.warn('[quadrantsDraft/save] distance error', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { department, eventId, rows, groups } = (await req.json()) as {
      department: string
      eventId: string
      rows: RowInput[]
      groups?: GroupInput[]
    }

    if (!department || !eventId || !Array.isArray(rows)) {
      return NextResponse.json(
        { ok: false, error: 'Bad payload' },
        { status: 400 }
      )
    }

    const coll = await resolveDeptCollection(department)
    const ref = db.collection(coll).doc(eventId)
    const isCuina = norm(department) === 'cuina'
    const isServeis = norm(department) === 'serveis'

    // 🧩 Separa per rols
    const responsables = rows.filter((r) => r.role === 'responsable')
    const conductors = rows.filter((r) => r.role === 'conductor')
    const treballadors = rows.filter((r) => r.role === 'treballador')
    const brigades = rows.filter((r) => r.role === 'brigada')

    // 🔹 Responsable principal (per compatibilitat antiga)
    const mainResponsable = responsables[0] ?? null

    const dataBase = {
      department: norm(department),
      eventId,

      // ⭐ Nou model multi-responsable
      responsables: responsables.map(toLine),

      // ⭐ Resta de rols
      conductors: conductors.map(toLine),
      treballadors: treballadors.map(toLine),
      brigades: brigades.map(toBrigadeLine),

      numDrivers: conductors.length,
      totalWorkers: treballadors.length,

      // 🔙 Camps antics de compatibilitat (els segueix llegint quadrants/get)
      responsable: mainResponsable ? toLine(mainResponsable) : null,
      responsableId: mainResponsable?.id || '',
      responsableName: mainResponsable?.name || '',

      status: 'draft' as const,
      updatedAt: new Date(),
    }

    // 📌 Preservem createdAt si ja existia
    const snap = await ref.get()
    let createdAt = new Date()
    const existing = snap.exists ? (snap.data() as any) : null
    if (snap.exists) {
      const old = snap.data() as any
      createdAt = old?.createdAt?.toDate
        ? old.createdAt.toDate()
        : old?.createdAt || createdAt
    }

    const updateData: Record<string, unknown> = {
      ...dataBase,
      createdAt,
    }

    if (isServeis && Array.isArray(groups) && groups.length > 0 && rows.some((r) => r.groupId)) {
      const eventDocsSnap = await db.collection(coll).where('eventId', '==', eventId).get()
      const existingDocs = eventDocsSnap.docs
      const baseDoc = existingDocs[0]?.data() || existing || {}
      const existingByGroup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

      existingDocs.forEach((doc) => {
        const data = doc.data() as any
        const groupId =
          data?.groups?.[0]?.id ||
          doc.id.split('__').pop() ||
          ''
        if (groupId) existingByGroup.set(String(groupId), doc)
      })

      const groupedRows = new Map<string, RowInput[]>()
      rows.forEach((row) => {
        if (!row.groupId) return
        const list = groupedRows.get(row.groupId) || []
        list.push(row)
        groupedRows.set(row.groupId, list)
      })

      const sanitizeGroupId = (value?: string | null) =>
        String(value || 'group')
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '') || 'group'

      const batch = db.batch()
      const keptDocIds = new Set<string>()

      groups.forEach((group, index) => {
        const groupId = String(group.id || `group-${index + 1}`)
        const groupRows = groupedRows.get(groupId) || []
        const byRole = (role: Role) => groupRows.filter((row) => row.role === role)
        const responsables = byRole('responsable')
        const conductorsRows = byRole('conductor')
        const treballadorsRows = byRole('treballador')
        const brigadesRows = byRole('brigada')
        const mainResponsable = responsables[0] ?? null
        const responsibleActsAsDriver = !!mainResponsable?.isDriver
        const conductorsForSave = [
          ...(responsibleActsAsDriver && mainResponsable ? [mainResponsable] : []),
          ...conductorsRows,
        ]

        const names = new Set<string>()
        ;[...responsables, ...conductorsForSave, ...treballadorsRows].forEach((row) => {
          if (!row.name || row.name === 'Extra') return
          names.add(row.name.toLowerCase().trim())
        })

        const extraCount =
          treballadorsRows.filter((row) => row.name === 'Extra').length +
          brigadesRows.reduce((sum, row) => sum + Number(row.workers || 0), 0)

        const baseGroupDoc = existingByGroup.get(groupId)
        const previous = (baseGroupDoc?.data() as any) || baseDoc
        const timingAnchor =
          conductorsForSave[0] ||
          mainResponsable ||
          groupRows[0] ||
          null
        const groupDate = group.serviceDate || groupRows[0]?.startDate || previous?.startDate || ''
        const startTime =
          timingAnchor?.startTime || group.startTime || groupRows[0]?.startTime || previous?.startTime || ''
        const endTime =
          timingAnchor?.endTime || group.endTime || groupRows[0]?.endTime || previous?.endTime || ''
        const arrivalTime =
          timingAnchor?.arrivalTime ?? group.arrivalTime ?? groupRows[0]?.arrivalTime ?? previous?.arrivalTime ?? null
        const meetingPoint =
          timingAnchor?.meetingPoint || group.meetingPoint || groupRows[0]?.meetingPoint || previous?.meetingPoint || ''
        const totalWorkers = names.size + extraCount
        const numDrivers = conductorsForSave.length
        const docId =
          baseGroupDoc?.id ||
          `${eventId}__event__${groupDate || previous?.startDate || 'nodate'}__${sanitizeGroupId(groupId)}`

        keptDocIds.add(docId)

        batch.set(
          db.collection(coll).doc(docId),
          {
            ...previous,
            department: norm(department),
            eventId,
            startDate: groupDate || previous?.startDate || '',
            endDate: groupDate || previous?.endDate || '',
            startTime,
            endTime,
            arrivalTime,
            meetingPoint,
            responsables: responsables.map(toLine),
            conductors: conductorsForSave.map(toLine),
            treballadors: treballadorsRows.map(toLine),
            brigades: brigadesRows.map(toBrigadeLine),
            numDrivers,
            totalWorkers,
            responsable: mainResponsable ? toLine(mainResponsable) : null,
            responsableId: mainResponsable?.id || '',
            responsableName: mainResponsable?.name || '',
            status: 'draft',
            updatedAt: new Date(),
            groups: [
              {
                ...group,
                id: groupId,
                serviceDate: groupDate || null,
                meetingPoint,
                startTime,
                endTime,
                arrivalTime,
                workers: totalWorkers,
                drivers: numDrivers,
                needsDriver: numDrivers > 0,
                driverId:
                  (responsibleActsAsDriver ? mainResponsable?.id : conductorsRows[0]?.id) ||
                  group.driverId ||
                  null,
                driverName:
                  (responsibleActsAsDriver ? mainResponsable?.name : conductorsForSave[0]?.name) ||
                  group.driverName ||
                  null,
                responsibleId: mainResponsable?.id || null,
                responsibleName: mainResponsable?.name || null,
              },
            ],
            createdAt:
              previous?.createdAt?.toDate?.() ? previous.createdAt.toDate() : previous?.createdAt || createdAt,
          },
          { merge: true }
        )
      })

      existingDocs.forEach((doc) => {
        if (!keptDocIds.has(doc.id)) batch.delete(doc.ref)
      })

      await batch.commit()
      return NextResponse.json({ ok: true })
    }

    if (isCuina && Array.isArray(existing?.groups) && rows.some((r) => r.groupId)) {
      const groups = existing.groups.map((g: any) => ({ ...g }))
      const grouped = new Map<string, RowInput[]>()
      rows.forEach((r) => {
        if (!r.groupId) return
        const list = grouped.get(r.groupId) || []
        list.push(r)
        grouped.set(r.groupId, list)
      })

      grouped.forEach((groupRows, groupId) => {
        const match = /^group-(\d+)$/.exec(groupId)
        if (!match) return
        const idx = Number(match[1]) - 1
        if (!Number.isFinite(idx) || idx < 0) return

        const first = groupRows[0]
        const byRole = (role: Role) => groupRows.filter((r) => r.role === role)
        const responsables = byRole('responsable')
        const conductorsGroup = byRole('conductor')
        const treballadorsGroup = byRole('treballador')

        const names = new Set<string>()
        ;[...responsables, ...conductorsGroup, ...treballadorsGroup].forEach((r) => {
          if (!r.name || r.name === 'Extra') return
          names.add(r.name.toLowerCase().trim())
        })

        const workersTotal = names.size + (groupRows.some((r) => r.name === 'Extra') ? 1 : 0)
        const driversTotal = conductorsGroup.length
        const responsibleName = responsables[0]?.name || null
        const responsibleId = responsables[0]?.id || null

        const base = groups[idx] || {}
        groups[idx] = {
          ...base,
          meetingPoint: base.meetingPoint || first?.meetingPoint || '',
          startTime: base.startTime || first?.startTime || '',
          arrivalTime: base.arrivalTime ?? first?.arrivalTime ?? null,
          endTime: base.endTime || first?.endTime || '',
          workers: workersTotal,
          drivers: driversTotal,
          responsibleName,
          responsibleId,
        }
      })

      const totalWorkers = groups.reduce((sum: number, g: any) => sum + Number(g.workers || 0), 0)
      const totalDrivers = groups.reduce((sum: number, g: any) => sum + Number(g.drivers || 0), 0)
      updateData.groups = groups
      updateData.totalWorkers = totalWorkers
      updateData.numDrivers = totalDrivers
      updateData.responsableName = groups[0]?.responsibleName || ''
      updateData.responsableId = groups[0]?.responsibleId || ''
      updateData.responsable = groups[0]?.responsibleName
        ? {
            name: groups[0].responsibleName,
            meetingPoint: groups[0].meetingPoint || '',
          }
        : null
    }

    // Upsert idempotent
    await ref.set(updateData, { merge: true })

    // Distància: sempre recalculada amb l'adreça actual
    const evSnap = await db.collection('stage_verd').doc(String(eventId)).get()
    const ev = evSnap.data() as any
    const destination = ev?.Ubicacio || ev?.location || ev?.address || ''
    const km = await calcDistanceKm(destination)
    if (km) {
      await ref.set({ distanceKm: km, distanceCalcAt: new Date() }, { merge: true })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[quadrantsDraft/save] error:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    )
  }
}
