import { NextResponse } from 'next/server'
import admin from 'firebase-admin'

import { requireAuth } from '@/lib/server/apiAuth'
import type { AccessUser } from '@/lib/accessControl'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  getCommercialReservationEndDate,
  type CommercialReservation,
} from '@/lib/commercialReservations'
import { PERM } from '@/lib/permissionKeys'
import { normalizeRole } from '@/lib/roles'
import { RESERVA_COMERCIALS_UI_PATH } from '@/lib/reservaComercialsPermissions'
import { canViewUiPath, isUiPermissionGranted } from '@/lib/server/permissions'

const RESERVA_UI_PATH = RESERVA_COMERCIALS_UI_PATH

type ReservationDoc = Record<string, unknown>

function accessUserFromAuth(user: {
  id: string
  role?: string | null
  department?: string | null
  name?: string | null
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  isTransportLead?: boolean
}): AccessUser & { id: string; name?: string | null } {
  return {
    id: user.id,
    role: user.role,
    department: user.department,
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

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const accessUser = accessUserFromAuth(auth.user)
    const canView = await canViewUiPath({ user: accessUser, path: RESERVA_UI_PATH })
    if (!canView) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const snap = await db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).get()
    const reservations = snap.docs
      .map((doc) => mapReservation(doc.id, doc.data() as ReservationDoc))
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))

    return NextResponse.json({ reservations })
  } catch (error) {
    console.error('[api/logistica/reserva-comercials GET]', error)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const sessionUser = auth.user as Parameters<typeof accessUserFromAuth>[0]
    const accessUser = accessUserFromAuth(sessionUser)
    const canRequest = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action(RESERVA_UI_PATH, 'request'),
    })
    if (!canRequest) {
      return NextResponse.json({ error: 'Sense permisos de sol·licitud' }, { status: 403 })
    }
    const user = auth.user

    const body = (await req.json()) as Partial<CommercialReservation>
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

    const now = admin.firestore.Timestamp.now()
    const ref = await db.collection(COMMERCIAL_RESERVATIONS_COLLECTION).add({
      requesterId: String(user?.id || ''),
      requesterName: String(user?.name || ''),
      requesterRole: String(user?.role || ''),
      requesterDepartment: String(user?.department || ''),
      date,
      endDate,
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
          body: `${String(user?.name || 'Un comercial')} ha fet una sol·licitud per al ${date}.`,
          type: 'commercial_vehicle_request',
          url: '/menu/logistica/reserva-comercials?tab=validacio',
          reservationId: ref.id,
        })
      )
    )

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
