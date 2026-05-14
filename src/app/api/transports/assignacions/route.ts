//file: src/app/api/transports/assignacions/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  orderedDayRangeFromISOStrings,
  queryQuadrantCollectionDocsInDateRange,
} from '@/lib/firestoreQuadrantsRangeQuery'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  getCommercialReservationEndDate,
} from '@/lib/commercialReservations'

export const runtime = 'nodejs'

const DEPTS = ['logistica', 'cuina', 'serveis'] as const
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const normalizeStageKey = (raw?: string) =>
  String(raw ?? '')
    .trim()
    .split('__')[0]
    .trim()

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

function quadrantNeedsAssignacionsTransport(q: QuadrantRecord): boolean {
  const conductors = Array.isArray(q.conductors) ? q.conductors : []
  const hasDemand = Boolean(q.transportRequested) || Number(q.numDrivers || 0) > 0
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
  service?: string
  status: 'draft' | 'confirmed'
  source?: 'quadrant' | 'commercialReservation'
  requesterName?: string
  readOnly?: boolean
  rows: TransportAssignmentRow[]
}

type TransportAssignmentRow = {
  id: string
  quadrantDocId: string
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
  Servei?: string
  Servicio?: string
  service?: string
  TipusServei?: string
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

type CommercialReservationRecord = Record<string, unknown> & {
  requesterName?: string
  date?: string
  endDate?: string
  startTime?: string
  endTime?: string
  destination?: string
  reason?: string
  status?: string
  assignedVehiclePlate?: string
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

    const eventsSnap = await db
      .collection('stage_verd')
      .where('DataInici', '>=', start)
      .where('DataInici', '<=', end)
      .get()

    const map = new Map<string, Item>()

    eventsSnap.docs.forEach((doc) => {
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
        service: String(e.Servei || e.Servicio || e.service || e.TipusServei || '').trim(),
        status: 'draft',
        source: 'quadrant',
        rows: [],
      })
    })

    const visibleEvents = new Set<string>()

    for (const dept of DEPTS) {
      const col = `quadrants${cap(dept)}`

      const { docs } = await queryQuadrantCollectionDocsInDateRange(
        db.collection(col),
        dayRange.start,
        dayRange.end
      )

      docs.forEach((doc) => {
        const q = doc.data() as QuadrantRecord
        const stageCode = resolveStageCodeForQuadrant(q, doc.id, map)
        if (!stageCode) return
        if (!quadrantNeedsAssignacionsTransport(q)) return

        visibleEvents.add(stageCode)

        const item = map.get(stageCode)
        if (!item) return

        if (q.status === 'confirmed') {
          item.status = 'confirmed'
        }

        const conductors = Array.isArray(q.conductors) ? q.conductors : []
        conductors.forEach((c, idx) => {
          item.rows.push({
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

    const reservationSnap = await db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).get()
    const reservationItems = reservationSnap.docs
      .map((doc): Item | null => {
        const reservation = doc.data() as CommercialReservationRecord
        const day = String(reservation.date || '').trim()
        const endDate = getCommercialReservationEndDate({
          date: day,
          endDate: String(reservation.endDate || '').trim(),
        })
        const status = String(reservation.status || '').trim()
        if (!day || endDate < start || day > end) return null
        if (status !== 'pending' && status !== 'confirmed') return null

        const startTime = String(reservation.startTime || '').trim()
        const endTime = String(reservation.endTime || '').trim() || startTime
        const requesterName = String(reservation.requesterName || '').trim()
        const plate = String(reservation.assignedVehiclePlate || '').trim()
        const reason = String(reservation.reason || '').trim() || 'Reserva comercial'
        const destination = String(reservation.destination || '').trim() || 'Sense destinació'

        return {
          eventCode: `RC-${doc.id.slice(0, 6).toUpperCase()}`,
          day,
          eventStartTime: startTime,
          eventEndTime: endTime,
          eventName: `${reason}${requesterName ? ` · ${requesterName}` : ''}`,
          location: destination,
          pax: 1,
          service: 'Reserva comercial',
          status: status === 'confirmed' ? 'confirmed' : 'draft',
          source: 'commercialReservation',
          requesterName,
          readOnly: true,
          rows: plate
            ? [
                {
                  id: `commercial-reservation:${doc.id}`,
                  quadrantDocId: '',
                  conductorIndex: -1,
                  department: 'comercial',
                  name: requesterName,
                  plate,
                  vehicleType: 'comercial',
                  startDate: day,
                  endDate,
                  startTime,
                  arrivalTime: startTime,
                  endTime,
                },
              ]
            : [],
        }
      })
      .filter((item): item is Item => item !== null)

    const items = Array.from(map.values())
      .filter((item) => visibleEvents.has(item.eventCode))
      .concat(reservationItems)
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
