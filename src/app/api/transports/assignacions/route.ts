//file: src/app/api/transports/assignacions/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const DEPTS = ['logistica', 'cuina', 'empresa']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Item = {
  eventCode: string
  day: string
  eventStartTime: string
  eventEndTime: string
  eventName: string
  location: string
  pax: number
  status: 'draft' | 'confirmed'
  rows: TransportAssignmentRow[]
}

type TransportAssignmentRow = {
  id: string
  department: string
  name: string
  plate: string
  vehicleType: string
  startDate: string
  endDate: string
  startTime: string
  arrivalTime: string
  endTime: string
}

type StageVerdEventRecord = Record<string, unknown> & {
  code?: string
  DataInici?: string
  HoraInici?: string
  HoraFi?: string
  NomEvent?: string
  Ubicacio?: string
  NumPax?: number | string
}

type QuadrantConductorRecord = {
  id?: string
  name?: string
  plate?: string
  vehicleType?: string
  startDate?: string
  endDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
}

type QuadrantRecord = Record<string, unknown> & {
  code?: string
  status?: string
  transportRequested?: boolean
  numDrivers?: number | string
  startDate?: string
  endDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
  conductors?: QuadrantConductorRecord[]
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ items: [] })
    }

    /* =========================
       1) ESDEVENIMENTS BASE
    ========================= */
    const eventsSnap = await db
      .collection('stage_verd')
      .where('DataInici', '>=', start)
      .where('DataInici', '<=', end)
      .get()

    const map = new Map<string, Item>()

    eventsSnap.docs.forEach(doc => {
      const e = doc.data() as StageVerdEventRecord
      if (!e?.code) return

      map.set(String(e.code), {
        eventCode: String(e.code),
        day: e.DataInici || '',
        eventStartTime: e.HoraInici || '',
        eventEndTime: e.HoraFi || '',
        eventName: e.NomEvent || '—',
        location: e.Ubicacio || '—',
        pax: Number(e.NumPax || 0),
        status: 'draft',
        rows: [],
      })
    })

    /* =========================
       2) QUADRANTS → FILTRAT BO
    ========================= */
    const visibleEvents = new Set<string>()

    for (const dept of DEPTS) {
      const col = `quadrants${cap(dept)}`

      const snap = await db
        .collection(col)
        .where('startDate', '>=', start)
        .where('startDate', '<=', end)
        .get()

      snap.docs.forEach(doc => {
        const q = doc.data() as QuadrantRecord
        const code = String(q?.code || '')
        if (!map.has(code)) return

        const hasDrivers =
          Array.isArray(q.conductors) && q.conductors.length > 0

        const hasDemand =
          Boolean(q.transportRequested) ||
          Number(q.numDrivers || 0) > 0

        // ❌ NO entra a assignacions
        if (!hasDrivers && !hasDemand) return

        visibleEvents.add(code)

        const item = map.get(code)!

        // status (draft / confirmed)
        if (q.status === 'confirmed') {
          item.status = 'confirmed'
        }

        // conductors → files
        if (hasDrivers) {
          q.conductors.forEach((c) => {
            item.rows.push({
              id: c.id || `${dept}-${Math.random()}`,
              department: dept,
              name: c.name || '',
              plate: c.plate || '',
              vehicleType: c.vehicleType || '',
              startDate: c.startDate ?? q.startDate ?? '',
              endDate: c.endDate ?? q.endDate ?? q.startDate ?? '',
              startTime: c.startTime ?? q.startTime ?? '',
              arrivalTime: c.arrivalTime ?? q.arrivalTime ?? '',
              endTime: c.endTime ?? q.endTime ?? '',
            })
          })
        }
      })
    }

    /* =========================
       3) SORTIDA FINAL
       👉 només visibles
    ========================= */
    const items = Array.from(map.values())
      .filter(i => visibleEvents.has(i.eventCode))
      .sort((a, b) => {
        if (a.day !== b.day) return a.day.localeCompare(b.day)
        return a.eventStartTime.localeCompare(b.eventStartTime)
      })

    return NextResponse.json({ items })
  } catch (err) {
    console.error('[transports/assignacions]', err)
    return NextResponse.json({ items: [] }, { status: 500 })
  }
}
