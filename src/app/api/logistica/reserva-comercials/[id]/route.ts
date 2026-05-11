import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import admin from 'firebase-admin'

import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  type CommercialReservation,
} from '@/lib/commercialReservations'
import { normalizeRole } from '@/lib/roles'

type SessionUser = {
  id?: string
  name?: string | null
  role?: string | null
  isTransportLead?: boolean | null
}

type ReservationDoc = Record<string, unknown>
type VehicleDoc = {
  id: string
  plate?: string
  available?: boolean
}

function canAccess(user?: SessionUser | null) {
  const role = normalizeRole(String(user?.role || ''))
  return Boolean(user?.id) && ['admin', 'direccio', 'cap', 'treballador', 'comercial', 'usuari'].includes(role)
}

function canValidate(user?: SessionUser | null) {
  const role = normalizeRole(String(user?.role || ''))
  return Boolean(user?.id) && (['admin', 'direccio', 'cap'].includes(role) || user?.isTransportLead === true)
}

function normalizeTimestamp(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString()
  }
  if (typeof ts === 'string') return ts
  return ''
}

function mapReservation(id: string, data: ReservationDoc): CommercialReservation {
  return {
    id,
    requesterId: String(data.requesterId || ''),
    requesterName: String(data.requesterName || ''),
    requesterRole: String(data.requesterRole || ''),
    requesterDepartment: String(data.requesterDepartment || ''),
    date: String(data.date || ''),
    startTime: String(data.startTime || ''),
    endTime: String(data.endTime || ''),
    destination: String(data.destination || ''),
    reason: String(data.reason || ''),
    notes: String(data.notes || ''),
    status:
      String(data.status || '') === 'confirmed'
        ? 'confirmed'
        : String(data.status || '') === 'cancelled'
          ? 'cancelled'
          : String(data.status || '') === 'rejected'
            ? 'rejected'
            : 'pending',
    assignedVehicleId: data.assignedVehicleId ? String(data.assignedVehicleId) : null,
    assignedVehiclePlate: data.assignedVehiclePlate ? String(data.assignedVehiclePlate) : null,
    approvedById: data.approvedById ? String(data.approvedById) : null,
    approvedByName: data.approvedByName ? String(data.approvedByName) : null,
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  }
}

function overlaps(a: CommercialReservation, b: CommercialReservation) {
  if (a.date !== b.date) return false
  return a.startTime < b.endTime && b.startTime < a.endTime
}

async function createUserNotification(params: {
  userId: string
  title: string
  body: string
  type: string
  url: string
  reservationId: string
}) {
  if (!params.userId) return
  await db.collection('users').doc(params.userId).collection('notifications').add({
    type: params.type,
    title: params.title,
    body: params.body,
    url: params.url,
    reservationId: params.reservationId,
    createdAt: Date.now(),
    read: false,
  })
}

async function findAvailableCommercialVehicle(target: CommercialReservation) {
  const [vehiclesSnap, reservationsSnap] = await Promise.all([
    db.collection('transports').where('type', '==', 'comercial').get(),
    db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).get(),
  ])

  const vehicles = vehiclesSnap.docs
    .map(
      (doc) =>
        ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        }) as VehicleDoc
    )
    .filter((vehicle) => vehicle.available !== false)

  const confirmed = reservationsSnap.docs
    .map((doc) => mapReservation(doc.id, doc.data() as ReservationDoc))
    .filter((reservation) => reservation.status === 'confirmed' && reservation.assignedVehicleId)

  return (
    vehicles.find((vehicle) => {
      return !confirmed.some(
        (reservation) =>
          reservation.assignedVehicleId === vehicle.id &&
          overlaps(reservation, target)
      )
    }) || null
  )
}

async function findCommercialVehicleById(targetVehicleId: string, target: CommercialReservation) {
  const [vehicleSnap, reservationsSnap] = await Promise.all([
    db.collection('transports').doc(targetVehicleId).get(),
    db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).get(),
  ])

  if (!vehicleSnap.exists) return { error: 'Vehicle no trobat' as const }

  const vehicle = {
    id: vehicleSnap.id,
    ...(vehicleSnap.data() as Record<string, unknown>),
  } as VehicleDoc

  if (String((vehicle as Record<string, unknown>).type || '') !== 'comercial') {
    return { error: 'El vehicle seleccionat no és de tipus comercial' as const }
  }

  if (vehicle.available === false) {
    return { error: 'El vehicle seleccionat no està disponible' as const }
  }

  const confirmed = reservationsSnap.docs
    .map((doc) => mapReservation(doc.id, doc.data() as ReservationDoc))
    .filter((reservation) => reservation.status === 'confirmed' && reservation.assignedVehicleId)

  const busy = confirmed.some(
    (reservation) =>
      reservation.id !== target.id &&
      reservation.assignedVehicleId === vehicle.id &&
      overlaps(reservation, target)
  )

  if (busy) {
    return { error: 'El vehicle seleccionat ja està ocupat en aquesta franja' as const }
  }

  return { vehicle }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const user = (session?.user || null) as SessionUser | null
    if (!canAccess(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { id } = await ctx.params
    const reservationId = String(id || '').trim()
    if (!reservationId) {
      return NextResponse.json({ error: 'Id invàlid' }, { status: 400 })
    }

    const ref = db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).doc(reservationId)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Reserva no trobada' }, { status: 404 })
    }

    const current = mapReservation(snap.id, snap.data() as ReservationDoc)
    const body = (await req.json()) as Partial<CommercialReservation>
    const nextStatus = String(body.status || '').trim() as CommercialReservation['status']
    const actorIsRequester = String(user?.id || '') === current.requesterId

    if (nextStatus === 'confirmed' || nextStatus === 'rejected') {
      if (!canValidate(user)) {
        return NextResponse.json({ error: 'Sense permisos de validació' }, { status: 403 })
      }
    } else if (nextStatus === 'cancelled') {
      if (!actorIsRequester && !canValidate(user)) {
        return NextResponse.json({ error: 'Sense permisos per anul·lar aquesta reserva' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Estat no vàlid' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {
      updatedAt: admin.firestore.Timestamp.now(),
    }

    if (nextStatus === 'confirmed') {
      const requestedVehicleId = String(body.assignedVehicleId || '').trim()
      const vehicleResult = requestedVehicleId
        ? await findCommercialVehicleById(requestedVehicleId, current)
        : { vehicle: await findAvailableCommercialVehicle(current) }

      if ('error' in vehicleResult) {
        return NextResponse.json({ error: vehicleResult.error }, { status: 409 })
      }

      const vehicle = vehicleResult.vehicle
      if (!vehicle) {
        return NextResponse.json({ error: 'No hi ha cap comercial lliure per a aquesta franja' }, { status: 409 })
      }

      patch.status = 'confirmed'
      patch.assignedVehicleId = String(vehicle.id)
      patch.assignedVehiclePlate = String(vehicle.plate || '')
      patch.approvedById = String(user?.id || '')
      patch.approvedByName = String(user?.name || '')
    } else if (nextStatus === 'rejected') {
      patch.status = 'rejected'
      patch.approvedById = String(user?.id || '')
      patch.approvedByName = String(user?.name || '')
    } else if (nextStatus === 'cancelled') {
      patch.status = 'cancelled'
      patch.assignedVehicleId = null
      patch.assignedVehiclePlate = null
      patch.approvedById = String(user?.id || '')
      patch.approvedByName = String(user?.name || '')
    }

    await ref.set(patch, { merge: true })

    const title =
      patch.status === 'confirmed'
        ? 'Reserva confirmada'
        : patch.status === 'rejected'
          ? 'Reserva rebutjada'
          : 'Reserva anul·lada'
    const bodyText =
      patch.status === 'confirmed'
        ? `La teva reserva del ${current.date} ha estat confirmada${patch.assignedVehiclePlate ? ` amb ${String(patch.assignedVehiclePlate)}` : ''}.`
        : patch.status === 'rejected'
          ? `La teva reserva del ${current.date} no ha estat validada.`
          : actorIsRequester
            ? `Has anul·lat la reserva del ${current.date}.`
            : `La teva reserva del ${current.date} ha estat anul·lada per transports.`

    await createUserNotification({
      userId: current.requesterId,
      title,
      body: bodyText,
      type: 'commercial_vehicle_validation',
      url: '/menu/logistica/reserva-comercials?tab=sollicitud',
      reservationId,
    })

    const updated = await ref.get()
    return NextResponse.json({
      reservation: mapReservation(updated.id, updated.data() as ReservationDoc),
    })
  } catch (error) {
    console.error('[api/logistica/reserva-comercials/:id PATCH]', error)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
