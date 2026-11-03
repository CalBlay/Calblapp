import { NextResponse } from 'next/server'
import admin from 'firebase-admin'

import { requireAuth, type SessionUserForApi } from '@/lib/server/apiAuth'
import { normalizeDept, type AccessUser } from '@/lib/accessControl'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  getCommercialReservationDayKeys,
  getCommercialReservationEndDate,
  type CommercialReservation,
} from '@/lib/commercialReservations'
import { queryCommercialReservationDocsByRange } from '@/lib/commercialReservations.server'
import { PERM } from '@/lib/permissionKeys'
import { normalizeRole } from '@/lib/roles'
import {
  RESERVA_COMERCIALS_ACTION,
  RESERVA_COMERCIALS_UI_PATH,
} from '@/lib/reservaComercialsPermissions'
import { canViewUiPath, isUiPermissionGranted } from '@/lib/server/permissions'
import { notifyReservaComercialUser } from '@/lib/logistica/reservaComercialNotifications'

const RESERVA_UI_PATH = RESERVA_COMERCIALS_UI_PATH

type ReservationDoc = Record<string, unknown>

function accessUserFromAuth(user: SessionUserForApi): AccessUser & { id: string; name?: string | null } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    name: user.name,
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
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

async function getTransportLeadUserIds() {
  const snap = await db.collection('users').where('departmentLower', '==', 'logistica').get()
  return snap.docs
    .filter((doc) => {
      const data = doc.data() as { role?: string; isTransportLead?: boolean }
      return normalizeRole(String(data.role || '')) === 'cap' && data.isTransportLead === true
    })
    .map((doc) => doc.id)
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

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const accessUser = accessUserFromAuth(auth.user)
    const canView = await canViewUiPath({ user: accessUser, path: RESERVA_UI_PATH })
    if (!canView) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const start = String(searchParams.get('start') || '').trim()
    const end = String(searchParams.get('end') || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
      return NextResponse.json({ error: 'Cal indicar un rang de dates vàlid.' }, { status: 400 })
    }

    const docs = await queryCommercialReservationDocsByRange(start, end)
    const reservations = docs
      .map((doc) => mapReservation(doc.id, doc.data() as ReservationDoc))
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))

    let departmentUsers: Array<{ id: string; name: string; department: string }> = []
    if (searchParams.get('includeDepartmentUsers') === '1') {
      const canManageDepartment = await isUiPermissionGranted({
        user: accessUser,
        permission: PERM.action(
          RESERVA_UI_PATH,
          RESERVA_COMERCIALS_ACTION.MANAGE_DEPARTMENT
        ),
      })
      if (canManageDepartment) {
        const department = normalizeDept(auth.user.department)
        const usersSnap = await db.collection('users').get()
        departmentUsers = usersSnap.docs
          .map((doc) => {
            const data = doc.data() as Record<string, unknown>
            return {
              id: doc.id,
              name: String(data.name || '').trim(),
              department: String(data.department || '').trim(),
              departmentNorm: normalizeDept(
                String(data.departmentLower || data.department || '')
              ),
            }
          })
          .filter(
            (candidate) =>
              candidate.name &&
              candidate.departmentNorm === department
          )
          .map(({ id, name, department: userDepartment }) => ({
            id,
            name,
            department: userDepartment,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
      }
    }

    return NextResponse.json({ reservations, departmentUsers })
  } catch (error) {
    console.error('[api/logistica/reserva-comercials GET]', error)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const accessUser = accessUserFromAuth(auth.user)
    const canRequest = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action(RESERVA_UI_PATH, RESERVA_COMERCIALS_ACTION.REQUEST),
    })
    if (!canRequest) {
      return NextResponse.json({ error: 'Sense permisos de sol·licitud' }, { status: 403 })
    }
    const user = auth.user

    const body = (await req.json()) as Partial<CommercialReservation>
    const requestedForId = String(body.requestedForId || user.id).trim()
    const targetIsRequester = requestedForId === user.id
    if (!targetIsRequester) {
      const canManageDepartment = await isUiPermissionGranted({
        user: accessUser,
        permission: PERM.action(
          RESERVA_UI_PATH,
          RESERVA_COMERCIALS_ACTION.MANAGE_DEPARTMENT
        ),
      })
      if (!canManageDepartment) {
        return NextResponse.json(
          { error: 'Sense permisos per demanar vehicles per a altres persones' },
          { status: 403 }
        )
      }
    }

    const targetSnap = await db.collection('users').doc(requestedForId).get()
    if (!targetSnap.exists && !targetIsRequester) {
      return NextResponse.json(
        { error: 'La persona seleccionada no existeix' },
        { status: 400 }
      )
    }
    const targetData = targetSnap.exists
      ? (targetSnap.data() as Record<string, unknown>)
      : {}
    const requesterSnap = targetIsRequester
      ? targetSnap
      : await db.collection('users').doc(user.id).get()
    const requesterData = requesterSnap.exists
      ? (requesterSnap.data() as Record<string, unknown>)
      : {}
    const requesterName = String(requesterData.name || user.name || '').trim()
    const requesterRole = String(requesterData.role || user.role || '').trim()
    const requesterDepartment = String(
      requesterData.department || user.department || ''
    ).trim()
    const targetDepartment = String(targetData.department || user.department || '').trim()
    if (
      !targetIsRequester &&
      normalizeDept(targetDepartment) !== normalizeDept(requesterDepartment)
    ) {
      return NextResponse.json(
        { error: 'Només pots demanar vehicles per al teu departament' },
        { status: 403 }
      )
    }
    const requestedForName = String(targetData.name || requesterName).trim()
    const requestedForRole = String(targetData.role || requesterRole).trim()
    const date = String(body.date || '').trim()
    const rawEndDate = String(body.endDate || '').trim()
    const endDate = rawEndDate || date
    const startTime = String(body.startTime || '').trim()
    const endTime = String(body.endTime || '').trim()
    const destination = String(body.destination || '').trim()
    const reason = String(body.reason || '').trim()
    const notes = String(body.notes || '').trim()

    if (!date || !endDate || !startTime || !endTime || !destination || !reason) {
      return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
    }
    if (date < todayIsoDate()) {
      return NextResponse.json({ error: 'Només es poden fer reserves d avui en endavant' }, { status: 400 })
    }
    if (endDate < date) {
      return NextResponse.json({ error: 'La data final no pot ser anterior a la inicial' }, { status: 400 })
    }
    if (`${endDate}T${endTime}:00` <= `${date}T${startTime}:00`) {
      return NextResponse.json({ error: 'La franja horària no és vàlida' }, { status: 400 })
    }
    const dayKeys = getCommercialReservationDayKeys({ date, endDate })
    if (dayKeys.length > 370) {
      return NextResponse.json({ error: 'La reserva no pot superar els 370 dies.' }, { status: 400 })
    }

    const now = admin.firestore.Timestamp.now()
    const ref = await db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).add({
      requesterId: String(user?.id || ''),
      requesterName,
      requesterRole,
      requesterDepartment,
      requestedForId,
      requestedForName,
      requestedForRole,
      requestedForDepartment: targetDepartment,
      date,
      endDate,
      dayKeys,
      startTime,
      endTime,
      destination,
      reason,
      notes,
      status: 'pending',
      assignedVehicleId: null,
      assignedVehiclePlate: null,
      approvedById: null,
      approvedByName: null,
      createdAt: now,
      updatedAt: now,
    })

    const leadIds = await getTransportLeadUserIds()
    await Promise.all(
      leadIds.map((userId) =>
        createUserNotification({
          userId,
          title: 'Nova reserva de comercial',
          body: `${requestedForName || requesterName || 'Un comercial'} necessita un vehicle per al ${date}${targetIsRequester ? '.' : ` (sol·licitat per ${requesterName || 'un gestor'}).`}`,
          type: 'commercial_vehicle_request',
          url: '/menu/logistica/reserva-comercials?tab=validacio',
          reservationId: ref.id,
        })
      )
    )

    if (!targetIsRequester) {
      await createUserNotification({
        userId: requestedForId,
        title: 'Nova reserva de vehicle per a tu',
        body: `${requesterName || 'Un gestor'} ha fet una sol·licitud de vehicle per a tu per al ${date}.`,
        type: 'commercial_vehicle_validation',
        url: '/menu/logistica/reserva-comercials?tab=sollicitud',
        reservationId: ref.id,
      })
    }

    const snap = await ref.get()
    const reservation = mapReservation(snap.id, snap.data() as ReservationDoc)
    return NextResponse.json({
      reservation: {
        ...reservation,
        endDate: getCommercialReservationEndDate(reservation),
      },
    })
  } catch (error) {
    console.error('[api/logistica/reserva-comercials POST]', error)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
