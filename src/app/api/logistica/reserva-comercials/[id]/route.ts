import { NextResponse } from 'next/server'
import admin from 'firebase-admin'

import { requireAuth, type SessionUserForApi } from '@/lib/server/apiAuth'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  getCommercialReservationEndDate,
  type CommercialReservation,
} from '@/lib/commercialReservations'
import type { AccessUser } from '@/lib/accessControl'
import { normalizeTransportType } from '@/lib/transportTypes'
import { PERM } from '@/lib/permissionKeys'
import { RESERVA_COMERCIALS_UI_PATH } from '@/lib/reservaComercialsPermissions'
import { canViewUiPath, isUiPermissionGranted } from '@/lib/server/permissions'
import { notifyReservaComercialUser } from '@/lib/logistica/reservaComercialNotifications'

const RESERVA_UI_PATH = RESERVA_COMERCIALS_UI_PATH

type ReservationDoc = Record<string, unknown>
type VehicleDoc = {
  id: string
  plate?: string
  available?: boolean
}

function accessUserFromAuth(user: SessionUserForApi): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    isTransportLead: Boolean(user.isTransportLead),
  }
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
    endDate: data.endDate ? String(data.endDate) : null,
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

function reservationWindow(reservation: Pick<CommercialReservation, 'date' | 'endDate' | 'startTime' | 'endTime'>) {
  const endDate = getCommercialReservationEndDate(reservation)
  return {
    start: new Date(`${reservation.date}T${reservation.startTime}:00`),
    end: new Date(`${endDate}T${reservation.endTime}:00`),
  }
}

function overlaps(a: CommercialReservation, b: CommercialReservation) {
  const rangeA = reservationWindow(a)
  const rangeB = reservationWindow(b)
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end
}

async function createUserNotification(params: {
  userId: string
  title: string
  body: string
  type: string
  url: string
  reservationId: string
}) {
  await notifyReservaComercialUser(params)
}

async function findAvailableCommercialVehicle(target: CommercialReservation) {
  const [vehiclesSnap, reservationsSnap] = await Promise.all([
    db.collection('transports').get(),
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
    .filter(
      (vehicle) =>
        vehicle.available !== false &&
        ['comercial', 'furgonetaPetita'].includes(
          normalizeTransportType(String((vehicle as Record<string, unknown>).type || ''))
        )
    )

  const confirmed = reservationsSnap.docs
    .map((doc) => mapReservation(doc.id, doc.data() as ReservationDoc))
    .filter((reservation) => reservation.status === 'confirmed' && reservation.assignedVehicleId)

  return (
    vehicles.find((vehicle) => {
      return !confirmed.some(
        (reservation) => reservation.assignedVehicleId === vehicle.id && overlaps(reservation, target)
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

  const vehicleType = normalizeTransportType(String((vehicle as Record<string, unknown>).type || ''))
  if (!['comercial', 'furgonetaPetita'].includes(vehicleType)) {
    return { error: 'El vehicle seleccionat no és apte per a reserva comercial' as const }
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
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const user = auth.user
    const accessUser = accessUserFromAuth(user)
    const canView = await canViewUiPath({ user: accessUser, path: RESERVA_UI_PATH })
    if (!canView) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const canRequest = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action(RESERVA_UI_PATH, 'request'),
    })
    const canValidate = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action(RESERVA_UI_PATH, 'validate'),
    })

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
      if (!canValidate) {
        return NextResponse.json({ error: 'Sense permisos de validació' }, { status: 403 })
      }
    } else if (nextStatus === 'cancelled') {
      if (actorIsRequester) {
        if (!canRequest) {
          return NextResponse.json({ error: 'Sense permisos per anul·lar aquesta reserva' }, { status: 403 })
        }
      } else if (!canValidate) {
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
        return NextResponse.json({ error: 'No hi ha cap vehicle lliure per a aquesta franja' }, { status: 409 })
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

    const shownEndDate = getCommercialReservationEndDate(current)
    const dateLabel =
      shownEndDate !== current.date
        ? `${current.date} ${current.startTime} -> ${shownEndDate} ${current.endTime}`
        : `${current.date} ${current.startTime}-${current.endTime}`

    const title =
      patch.status === 'confirmed'
        ? 'Reserva confirmada'
        : patch.status === 'rejected'
          ? 'Reserva rebutjada'
          : 'Reserva anul·lada'
    const bodyText =
      patch.status === 'confirmed'
        ? `La teva reserva ${dateLabel} ha estat confirmada${patch.assignedVehiclePlate ? ` amb ${String(patch.assignedVehiclePlate)}` : ''}.`
        : patch.status === 'rejected'
          ? `La teva reserva ${dateLabel} no ha estat validada.`
          : actorIsRequester
            ? `Has anul·lat la reserva ${dateLabel}.`
            : `La teva reserva ${dateLabel} ha estat anul·lada per transports.`

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
