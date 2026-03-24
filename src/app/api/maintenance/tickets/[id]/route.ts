import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import {
  buildTicketBody,
  notifyMaintenanceAssignees,
  notifyTicketCreator,
} from '@/lib/maintenanceNotifications'
import admin from 'firebase-admin'

export const runtime = 'nodejs'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
}

type UpdatePayload = {
  status?: 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat' | 'resolut'
  assignedToIds?: string[]
  assignedToNames?: string[]
  needsVehicle?: boolean
  vehicleId?: string | null
  vehiclePlate?: string | null
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  location?: string
  machine?: string
  description?: string
  plannedStart?: number | null
  plannedEnd?: number | null
  estimatedMinutes?: number | null
  supplierResolvedAt?: number | null
  statusStartTime?: string | null
  statusEndTime?: string | null
  statusNote?: string | null
}

const normalizePriority = (value?: string) => {
  const v = (value || '').trim().toLowerCase()
  if (v === 'urgent') return 'urgent'
  if (v === 'alta') return 'alta'
  if (v === 'baixa') return 'baixa'
  return 'normal'
}

const normalizeStatus = (value?: string) => {
  const v = (value || '').trim().toLowerCase()
  if (v === 'assignat') return 'assignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut' || v === 'validat') return 'validat'
  return 'nou'
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const dept = (user.department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap' && role !== 'treballador') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = snap.data() as any
    if (role === 'treballador') {
      const assignedIds: string[] = Array.isArray(data.assignedToIds) ? data.assignedToIds : []
      if (!assignedIds.includes(user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (
      role === 'cap' &&
      !isMaintenanceCapDepartment(dept) &&
      dept !== 'decoracio' &&
      dept !== 'decoracions' &&
      dept !== 'decoracion'
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      ticket: {
        id: snap.id,
        ...data,
        status: normalizeStatus(data.status),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const dept = (user.department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap' && role !== 'treballador') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json()) as UpdatePayload

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const current = snap.data() as any

    if (role === 'treballador') {
      const assignedIds: string[] = Array.isArray(current.assignedToIds)
        ? current.assignedToIds
        : []
      const isAssigned = assignedIds.includes(user.id)
      if (!isAssigned) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const wantsAssign =
        body.assignedToIds !== undefined ||
        body.assignedToNames !== undefined ||
        body.needsVehicle !== undefined ||
        body.vehicleId !== undefined ||
        body.vehiclePlate !== undefined ||
        body.priority !== undefined ||
        body.location !== undefined ||
        body.machine !== undefined ||
        body.description !== undefined
      if (wantsAssign) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedById: user.id,
      updatedByName: user.name || '',
    }

    let nextStatus = body.status ? normalizeStatus(body.status) : null
    const nextPriority = body.priority ? normalizePriority(body.priority) : null
    const currentStatus = normalizeStatus(current.status)
    const canValidate = role === 'admin' || (role === 'cap' && isMaintenanceCapDepartment(dept))
    const canReopen = role === 'admin' || (role === 'cap' && isMaintenanceCapDepartment(dept))

    const wantsDataEdit =
      body.assignedToIds !== undefined ||
      body.assignedToNames !== undefined ||
      body.needsVehicle !== undefined ||
      body.vehicleId !== undefined ||
      body.vehiclePlate !== undefined ||
      body.priority !== undefined ||
      body.location !== undefined ||
      body.machine !== undefined ||
      body.description !== undefined ||
      body.plannedStart !== undefined ||
      body.plannedEnd !== undefined ||
      body.estimatedMinutes !== undefined ||
      body.supplierResolvedAt !== undefined

    if (currentStatus === 'validat') {
      const onlyReopenRequest =
        nextStatus === 'fet' &&
        !wantsDataEdit &&
        body.statusStartTime === undefined &&
        body.statusEndTime === undefined &&
        body.statusNote === undefined

      if (!onlyReopenRequest) {
        return NextResponse.json(
          { error: 'Cal reobrir el ticket abans de modificar-lo' },
          { status: 400 }
        )
      }

      if (!canReopen) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (nextStatus) updates.status = nextStatus
    if (nextPriority) updates.priority = nextPriority
    if (body.location !== undefined) updates.location = String(body.location).trim()
    if (body.machine !== undefined) updates.machine = String(body.machine).trim()
    if (body.description !== undefined) updates.description = String(body.description).trim()
    if (body.assignedToIds !== undefined) updates.assignedToIds = body.assignedToIds
    if (body.assignedToNames !== undefined) updates.assignedToNames = body.assignedToNames
    if (body.needsVehicle !== undefined) updates.needsVehicle = body.needsVehicle
    if (body.vehicleId !== undefined) updates.vehicleId = body.vehicleId
    if (body.vehiclePlate !== undefined) updates.vehiclePlate = body.vehiclePlate
    if (body.plannedStart !== undefined) updates.plannedStart = body.plannedStart
    if (body.plannedEnd !== undefined) updates.plannedEnd = body.plannedEnd
    if (body.estimatedMinutes !== undefined) updates.estimatedMinutes = body.estimatedMinutes
    if (body.supplierResolvedAt !== undefined) updates.supplierResolvedAt = body.supplierResolvedAt

    if (body.assignedToIds !== undefined) {
      updates.assignedAt = body.assignedToIds.length ? Date.now() : null
      updates.assignedById = user.id
      updates.assignedByName = user.name || ''
      const currentStatus = normalizeStatus(current.status)
      if (!nextStatus && body.assignedToIds.length > 0 && currentStatus === 'nou') {
        nextStatus = 'assignat'
        updates.status = nextStatus
      }
    }

    if (nextStatus === 'validat') {
      if (!canValidate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (currentStatus !== 'fet') {
        return NextResponse.json({ error: 'Nomes es pot validar des de Fet' }, { status: 400 })
      }
    }

    if (role === 'treballador' && nextStatus) {
      if (current.externalized && nextStatus === 'fet') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const allowed: Record<string, string[]> = {
        assignat: ['en_curs', 'espera'],
        en_curs: ['espera', 'fet', 'no_fet'],
        espera: ['en_curs', 'fet', 'no_fet'],
      }
      const nextAllowed = allowed[currentStatus] || []
      if (!nextAllowed.includes(nextStatus)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (nextStatus) {
      updates.statusHistory = admin.firestore.FieldValue.arrayUnion({
        status: nextStatus,
        at: Date.now(),
        byId: user.id,
        byName: user.name || '',
        startTime: body.statusStartTime ?? null,
        endTime: body.statusEndTime ?? null,
        note: body.statusNote ?? '',
      })
    }

    await ref.set(updates, { merge: true })

    if (nextStatus === 'validat') {
      const ticketCode = current.ticketCode || current.incidentNumber || null
      const creatorId = current.createdById || null
      const effectiveMachine =
        body.machine !== undefined ? String(body.machine).trim() : (current.machine || '')
      const effectiveLocation =
        body.location !== undefined ? String(body.location).trim() : (current.location || '')
      const effectiveDescription =
        body.description !== undefined ? String(body.description).trim() : (current.description || '')

      await notifyTicketCreator({
        uid: creatorId,
        payload: {
          type: 'maintenance_ticket_validated',
          title: 'Ticket validat',
          body: buildTicketBody({
            machine: effectiveMachine,
            location: effectiveLocation,
            description: effectiveDescription,
          }),
          ticketId: id,
          ticketCode,
          status: 'validat',
          priority: updates.priority ? String(updates.priority) : current.priority || null,
          location: effectiveLocation,
          machine: effectiveMachine,
          source: current.source || null,
        },
        excludeIds: [user.id],
      })
    }

    if (body.assignedToIds !== undefined && body.assignedToIds.length > 0) {
      const effectiveMachine =
        body.machine !== undefined ? String(body.machine).trim() : (current.machine || '')
      const effectiveLocation =
        body.location !== undefined ? String(body.location).trim() : (current.location || '')
      const effectiveDescription =
        body.description !== undefined ? String(body.description).trim() : (current.description || '')
      const ticketCode = current.ticketCode || current.incidentNumber || null

      await notifyMaintenanceAssignees({
        uids: body.assignedToIds,
        payload: {
          type: 'maintenance_ticket_assigned',
          title: 'Ticket assignat',
          body: buildTicketBody({
            machine: effectiveMachine,
            location: effectiveLocation,
            description: effectiveDescription,
          }),
          ticketId: id,
          ticketCode,
          status: updates.status ? String(updates.status) : current.status || null,
          priority: updates.priority ? String(updates.priority) : current.priority || null,
          location: effectiveLocation,
          machine: effectiveMachine,
          source: current.source || null,
        },
        excludeIds: [user.id],
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const dept = (user.department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const { id } = await ctx.params

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = snap.data() as any
    const canDeleteAny =
      role === 'admin' || (role === 'cap' && isMaintenanceCapDepartment(dept))
    if (data.createdById !== user.id && !canDeleteAny) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ref.delete()
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
