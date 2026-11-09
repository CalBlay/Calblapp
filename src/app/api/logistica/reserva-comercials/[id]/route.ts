import { NextResponse } from 'next/server'
import admin from 'firebase-admin'

import { requireAuth, type SessionUserForApi } from '@/lib/server/apiAuth'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  getCommercialReservationDayKeys,
  getCommercialReservationEndDate,
  isCommercialReservationVehicleReassignment,
  type CommercialReservation,
} from '@/lib/commercialReservations'
import { queryCommercialReservationDocsByRange } from '@/lib/commercialReservations.server'
import { normalizeDept, type AccessUser } from '@/lib/accessControl'
import { normalizeTransportType } from '@/lib/transportTypes'
import { PERM } from '@/lib/permissionKeys'
import {
  RESERVA_COMERCIALS_ACTION,
  RESERVA_COMERCIALS_UI_PATH,
} from '@/lib/reservaComercialsPermissions'
import { canViewUiPath, isUiPermissionGranted } from '@/lib/server/permissions'
import { notifyReservaComercialUser } from '@/lib/logistica/reservaComercialNotifications'
import { normalizeRole } from '@/lib/roles'

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
  const requesterId = String(data.requesterId || '')
  const requesterName = String(data.requesterName || '')
  const requesterRole = String(data.requesterRole || '')
  const requesterDepartment = String(data.requesterDepartment || '')
  return {
    id,
    requesterId,
    requesterName,
    requesterRole,
    requesterDepartment,
    requestedForId: String(data.requestedForId || requesterId),
    requestedForName: String(data.requestedForName || requesterName),
    requestedForRole: String(data.requestedForRole || requesterRole),
    requestedForDepartment: String(data.requestedForDepartment || requesterDepartment),
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

async function getTransportLeadUserIds() {
  const snap = await db.collection('users').where('departmentLower', '==', 'logistica').get()
  return snap.docs
    .filter((doc) => {
      const data = doc.data() as { role?: string; isTransportLead?: boolean }
      return normalizeRole(String(data.role || '')) === 'cap' && data.isTransportLead === true
    })
    .map((doc) => doc.id)
}

async function findAvailableCommercialVehicle(target: CommercialReservation) {
  const [vehiclesSnap, reservationDocs] = await Promise.all([
    db.collection('transports').get(),
    queryCommercialReservationDocsByRange(
      target.date,
      getCommercialReservationEndDate(target)
    ),
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

  const confirmed = reservationDocs
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
  const [vehicleSnap, reservationDocs] = await Promise.all([
    db.collection('transports').doc(targetVehicleId).get(),
    queryCommercialReservationDocsByRange(
      target.date,
      getCommercialReservationEndDate(target)
    ),
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

  const confirmed = reservationDocs
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
      permission: PERM.action(RESERVA_UI_PATH, RESERVA_COMERCIALS_ACTION.REQUEST),
    })
    const canValidate = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action(RESERVA_UI_PATH, RESERVA_COMERCIALS_ACTION.VALIDATE),
    })
    const canManageDepartment = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action(
        RESERVA_UI_PATH,
        RESERVA_COMERCIALS_ACTION.MANAGE_DEPARTMENT
      ),
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
    const body = (await req.json()) as Partial<CommercialReservation> & { action?: string }
    const action = String(body.action || '').trim()
    const nextStatus = String(body.status || '').trim() as CommercialReservation['status']
    const actorIsRequester = String(user?.id || '') === current.requesterId
    const actorIsBeneficiary = String(user?.id || '') === current.requestedForId

    if (action === 'edit') {
      if (!canManageDepartment || current.status !== 'confirmed') {
        return NextResponse.json(
          { error: 'Només el gestor de vehicles pot modificar una reserva confirmada' },
          { status: 403 }
        )
      }
      if (normalizeDept(current.requestedForDepartment) !== normalizeDept(user.department || '')) {
        return NextResponse.json(
          { error: 'Només pots modificar reserves del teu departament' },
          { status: 403 }
        )
      }

      const requestedForId = String(body.requestedForId || '').trim()
      const targetSnap = await db.collection('users').doc(requestedForId).get()
      if (!targetSnap.exists) {
        return NextResponse.json({ error: 'La persona seleccionada no existeix' }, { status: 400 })
      }
      const targetData = targetSnap.data() as Record<string, unknown>
      const targetDepartment = String(targetData.department || '').trim()
      if (normalizeDept(targetDepartment) !== normalizeDept(user.department || '')) {
        return NextResponse.json(
          { error: 'Només pots assignar conductors del teu departament' },
          { status: 403 }
        )
      }

      const date = String(body.date || '').trim()
      const endDate = String(body.endDate || date).trim() || date
      const startTime = String(body.startTime || '').trim()
      const endTime = String(body.endTime || '').trim()
      const destination = String(body.destination || '').trim()
      const reason = String(body.reason || '').trim()
      const notes = String(body.notes || '').trim()
      if (!date || !endDate || !startTime || !endTime || !destination || !reason) {
        return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
      }
      if (date < todayIsoDate()) {
        return NextResponse.json(
          { error: "Només es poden fer reserves d'avui en endavant" },
          { status: 400 }
        )
      }
      if (endDate < date || `${endDate}T${endTime}:00` <= `${date}T${startTime}:00`) {
        return NextResponse.json({ error: 'La franja horària no és vàlida' }, { status: 400 })
      }
      const dayKeys = getCommercialReservationDayKeys({ date, endDate })
      if (dayKeys.length > 370) {
        return NextResponse.json({ error: 'La reserva no pot superar els 370 dies.' }, { status: 400 })
      }

      const scheduleChanged =
        date !== current.date ||
        endDate !== getCommercialReservationEndDate(current) ||
        startTime !== current.startTime ||
        endTime !== current.endTime
      const driverChanged = requestedForId !== current.requestedForId
      const requestedForName = String(targetData.name || '').trim()
      const editPatch: Record<string, unknown> = {
        requestedForId,
        requestedForName,
        requestedForRole: String(targetData.role || '').trim(),
        requestedForDepartment: targetDepartment,
        date,
        endDate,
        dayKeys,
        startTime,
        endTime,
        destination,
        reason,
        notes,
        updatedAt: admin.firestore.Timestamp.now(),
      }
      if (scheduleChanged) {
        editPatch.status = 'pending'
        editPatch.assignedVehicleId = null
        editPatch.assignedVehiclePlate = null
        editPatch.approvedById = null
        editPatch.approvedByName = null
      }
      await ref.set(editPatch, { merge: true })

      const oldDateLabel = `${current.date} ${current.startTime}-${getCommercialReservationEndDate(current)} ${current.endTime}`
      const newDateLabel = `${date} ${startTime}-${endDate} ${endTime}`
      const notifications: Array<Promise<void>> = []
      if (driverChanged && current.requestedForId) {
        notifications.push(
          createUserNotification({
            userId: current.requestedForId,
            title: 'Reserva de vehicle anul·lada',
            body: `La teva reserva ${oldDateLabel} s'ha anul·lat perquè s'ha canviat el conductor.`,
            type: 'commercial_vehicle_validation',
            url: '/menu/logistica/reserva-comercials?tab=sollicitud',
            reservationId,
          })
        )
      }
      if (driverChanged && requestedForId) {
        notifications.push(
          createUserNotification({
            userId: requestedForId,
            title: scheduleChanged ? 'Nova sol·licitud de vehicle per a tu' : 'Reserva de vehicle per a tu',
            body: scheduleChanged
              ? `T'han assignat una sol·licitud de vehicle per a ${newDateLabel}, pendent de validació de transports.`
              : `T'han assignat la reserva confirmada ${newDateLabel}${current.assignedVehiclePlate ? ` amb ${current.assignedVehiclePlate}` : ''}.`,
            type: 'commercial_vehicle_validation',
            url: '/menu/logistica/reserva-comercials?tab=sollicitud',
            reservationId,
          })
        )
      } else if (scheduleChanged && requestedForId) {
        notifications.push(
          createUserNotification({
            userId: requestedForId,
            title: 'Reserva modificada i pendent de validació',
            body: `La teva reserva ha canviat de ${oldDateLabel} a ${newDateLabel} i transports l'ha de validar de nou.`,
            type: 'commercial_vehicle_validation',
            url: '/menu/logistica/reserva-comercials?tab=sollicitud',
            reservationId,
          })
        )
      }
      if (scheduleChanged) {
        const leadIds = await getTransportLeadUserIds()
        notifications.push(
          ...leadIds.map((userId) =>
            createUserNotification({
              userId,
              title: 'Reserva modificada pendent de revalidació',
              body: `${requestedForName || 'Un conductor'} necessita revalidar la reserva per al ${newDateLabel}.`,
              type: 'commercial_vehicle_request',
              url: '/menu/logistica/reserva-comercials?tab=validacio',
              reservationId,
            })
          )
        )
      }
      await Promise.all(notifications)

      const updated = await ref.get()
      return NextResponse.json({
        reservation: mapReservation(updated.id, updated.data() as ReservationDoc),
      })
    }

    if (nextStatus === 'confirmed' || nextStatus === 'rejected') {
      if (!canValidate) {
        return NextResponse.json({ error: 'Sense permisos de validació' }, { status: 403 })
      }
    } else if (nextStatus === 'cancelled') {
      if (actorIsRequester || actorIsBeneficiary) {
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
    let vehicleWasChanged = false
    const previousVehiclePlate = current.assignedVehiclePlate || ''

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

      vehicleWasChanged = isCommercialReservationVehicleReassignment(current, vehicle.id)
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
      vehicleWasChanged
        ? 'Vehicle de reserva modificat'
        : patch.status === 'confirmed'
        ? 'Reserva confirmada'
        : patch.status === 'rejected'
          ? 'Reserva rebutjada'
          : 'Reserva anul·lada'
    const reservationOwner =
      current.requestedForId !== current.requesterId && current.requestedForName
        ? `La reserva de ${current.requestedForName}`
        : 'La teva reserva'
    const bodyText =
      vehicleWasChanged
        ? `${reservationOwner}: s'ha canviat el vehicle ${dateLabel}: ${previousVehiclePlate || 'vehicle anterior'} → ${String(patch.assignedVehiclePlate || 'nou vehicle')}.`
        : patch.status === 'confirmed'
        ? `${reservationOwner} ${dateLabel} ha estat confirmada${patch.assignedVehiclePlate ? ` amb ${String(patch.assignedVehiclePlate)}` : ''}.`
        : patch.status === 'rejected'
          ? `${reservationOwner} ${dateLabel} no ha estat validada.`
          : actorIsRequester || actorIsBeneficiary
            ? `${reservationOwner} ${dateLabel} ha estat anul·lada.`
            : `${reservationOwner} ${dateLabel} ha estat anul·lada per transports.`

    const recipientIds = [...new Set([current.requesterId, current.requestedForId].filter(Boolean))]
    await Promise.all(
      recipientIds.map((userId) =>
        createUserNotification({
          userId,
          title,
          body: bodyText,
          type: 'commercial_vehicle_validation',
          url: '/menu/logistica/reserva-comercials?tab=sollicitud',
          reservationId,
        })
      )
    )

    const updated = await ref.get()
    return NextResponse.json({
      reservation: mapReservation(updated.id, updated.data() as ReservationDoc),
    })
  } catch (error) {
    console.error('[api/logistica/reserva-comercials/:id PATCH]', error)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
