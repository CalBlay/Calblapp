//file: src/app/api/transports/assignacions/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  orderedDayRangeFromISOStrings,
  queryQuadrantCollectionDocsInDateRange,
} from '@/lib/firestoreQuadrantsRangeQuery'

export const runtime = 'nodejs'

/**
 * Només Logística i Cuina: són els departaments que poden requerir conductor de transport
 * en el model actual (es coincideix amb el que demana el mòdul Assignacions).
 */
const DEPTS = ['logistica', 'cuina'] as const
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const normalizeStageKey = (raw?: string) =>
  String(raw ?? '')
    .trim()
    .split('__')[0]
    .trim()

/**
 * Clau per enllaçar quadrant ↔ stage_verd: `code`, si no `eventId` normalitzat, si no id del document.
 */
function resolveStageCodeForQuadrant(
  q: QuadrantRecord,
  docId: string,
  map: Map<string, Item>
): string | null {
  const tryKey = (k: string) => {
    const n = normalizeStageKey(k)
    return n && map.has(n) ? n : null
  }
  return (
    tryKey(String(q?.code ?? '')) ||
    tryKey(String((q as { eventId?: string }).eventId ?? '')) ||
    tryKey(docId)
  )
}

/** Demanen conductor (flags) o ja tenen files `conductors` (esborrany o confirmat amb vehicle/matrícula). */
function quadrantNeedsAssignacionsTransport(q: QuadrantRecord): boolean {
  const conductors = Array.isArray(q.conductors) ? q.conductors : []
  const hasDemand =
    Boolean(q.transportRequested) || Number(q.numDrivers || 0) > 0
  return hasDemand || conductors.length > 0
}

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
  /** Id del document quadrant a Firestore (per save quan el conductor encara no té id propi). */
  quadrantDocId: string
  /** Índex dins de `conductors[]` d’aquest document en el moment de la lectura. */
  conductorIndex: number
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
  eventId?: string
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

    const dayRange = orderedDayRangeFromISOStrings(start, end)
    if (!dayRange) {
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

      const { docs } = await queryQuadrantCollectionDocsInDateRange(
        db.collection(col),
        dayRange.start,
        dayRange.end
      )

      docs.forEach(doc => {
        const q = doc.data() as QuadrantRecord
        const stageCode = resolveStageCodeForQuadrant(q, doc.id, map)
        if (!stageCode) return

        if (!quadrantNeedsAssignacionsTransport(q)) return

        visibleEvents.add(stageCode)

        const item = map.get(stageCode)!

        // status (draft / confirmed)
        if (q.status === 'confirmed') {
          item.status = 'confirmed'
        }

        const conductors = Array.isArray(q.conductors) ? q.conductors : []
        conductors.forEach((c, idx) => {
          item.rows.push({
            // ID estable per poder substituir la mateixa fila al save (mai Math.random per càrrega).
            id: c.id || `pending:${doc.id}:${idx}`,
            quadrantDocId: doc.id,
            conductorIndex: idx,
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

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[transports/assignacions]', err)
    return NextResponse.json(
      { items: [] },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
