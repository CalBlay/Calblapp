import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import {
  buildTicketBody,
  notifyMaintenanceManagers,
} from '@/lib/maintenanceNotifications'
import { registerMediaRef } from '@/lib/media/storageMediaIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
}

type TicketPayload = {
  location?: string
  machine?: string
  description?: string
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  ticketType?: 'maquinaria' | 'deco'
  imageUrl?: string | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
  source?: 'manual' | 'incidencia' | 'whatsblapp'
  status?: string
  incidentNumber?: string
  plannedStart?: number | null
  plannedEnd?: number | null
  estimatedMinutes?: number | null
}

type MaintenanceTicketRecord = Record<string, unknown> & {
  ticketCode?: string
  incidentNumber?: string
  status?: string
  priority?: string
  ticketType?: string
  createdAt?: string | number | { toDate?: () => Date }
  plannedStart?: string | number | null
  assignedAt?: string | number | null
  statusHistory?: Array<{ status?: string; at?: string | number | { toDate?: () => Date } | null }>
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

const normalizeName = (value?: string) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function generateTicketCode(): Promise<string> {
  const counterRef = db.collection('counters').doc('maintenanceTickets')
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = (snap.data()?.value as number) || 0
    const updated = current + 1
    tx.set(counterRef, { value: updated }, { merge: true })
    return updated
  })
  return `TIC${String(next).padStart(6, '0')}`
}

function getTicketTimelineMs(ticket: MaintenanceTicketRecord): number | null {
  const base = ticket?.plannedStart ?? ticket?.assignedAt ?? ticket?.createdAt ?? null
  if (typeof base === 'number' && Number.isFinite(base)) return base
  if (typeof base === 'string') {
    const parsed = new Date(base).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  if (base && typeof base === 'object' && typeof base.toDate === 'function') {
    const parsed = base.toDate().getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function getTicketDateByMode(
  ticket: MaintenanceTicketRecord,
  mode: 'all' | 'planned' | 'created' | 'updated' | 'completed'
): number | null {
  const toMs = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = new Date(value).getTime()
      return Number.isNaN(parsed) ? null : parsed
    }
    if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
      const parsed = (value as { toDate: () => Date }).toDate().getTime()
      return Number.isNaN(parsed) ? null : parsed
    }
    return null
  }

  if (mode === 'planned') return toMs(ticket.plannedStart)
  if (mode === 'created') return toMs(ticket.createdAt)
  if (mode === 'updated') {
    const history = Array.isArray(ticket.statusHistory) ? ticket.statusHistory : []
    const latest = history
      .map((entry) => toMs(entry?.at))
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0]
    return latest ?? toMs(ticket.assignedAt) ?? toMs(ticket.createdAt)
  }
  if (mode === 'completed') {
    const history = Array.isArray(ticket.statusHistory) ? ticket.statusHistory : []
    const completed = history
      .filter((entry) => normalizeStatus(String(entry?.status || '')) === 'validat')
      .map((entry) => toMs(entry?.at))
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0]
    return completed
  }
  return getTicketTimelineMs(ticket)
}

export async function GET(req: Request) {
  const startedAt = Date.now()
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const sessionName = normalizeName(user.name || '')
  const deptRaw = (user.department || '').toString()
  const dept = deptRaw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (
    role !== 'admin' &&
    role !== 'direccio' &&
    role !== 'cap' &&
    role !== 'treballador' &&
    role !== 'comercial' &&
    role !== 'usuari'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = (searchParams.get('status') || 'all').toLowerCase()
  const priority = (searchParams.get('priority') || 'all').toLowerCase()
  const location = (searchParams.get('location') || '').trim()
  const assignedToId = (searchParams.get('assignedToId') || '').trim()
  const ticketType = (searchParams.get('ticketType') || 'all').toLowerCase()
  const code = (searchParams.get('code') || '').trim().toUpperCase()
  const start = (searchParams.get('start') || '').trim()
  const end = (searchParams.get('end') || '').trim()
  const dateMode = ((searchParams.get('dateMode') || 'all').trim().toLowerCase() || 'all') as
    | 'all'
    | 'planned'
    | 'created'
    | 'updated'
    | 'completed'
  const cursorCreatedAt = Number(searchParams.get('cursorCreatedAt') || 0)
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 100)))

  const canViewAllTickets =
    role === 'admin' ||
    role === 'direccio' ||
    (role === 'cap' && isMaintenanceCapDepartment(dept))

  try {
    let ref: FirebaseFirestore.Query = db.collection('maintenanceTickets')
    if (status && status !== 'all') ref = ref.where('status', '==', status)
    if (priority && priority !== 'all') ref = ref.where('priority', '==', priority)
    if (location) ref = ref.where('location', '==', location)
    const shouldQueryDecoOnly = ticketType === 'deco'
    if (shouldQueryDecoOnly) {
      ref = ref.where('ticketType', '==', 'deco')
    }

    if (assignedToId && canViewAllTickets) {
      ref = ref.where('assignedToIds', 'array-contains', assignedToId)
    } else if (!canViewAllTickets && !assignedToId && user.id) {
      ref = ref.where('createdById', '==', user.id)
    }

    const fallbackRef = ref
    const mapTickets = (snap: FirebaseFirestore.QuerySnapshot) =>
      snap.docs.map((doc) => {
        const data = doc.data() as MaintenanceTicketRecord
        const createdAtSource = data.createdAt
        const createdAt =
          createdAtSource && typeof createdAtSource === 'object' && typeof createdAtSource.toDate === 'function'
            ? createdAtSource.toDate().toISOString()
            : data.createdAt || ''
        return {
          id: doc.id,
          ...data,
          status: normalizeStatus(data.status),
          priority: normalizePriority(data.priority),
          ticketType: (data.ticketType || 'maquinaria').toString().toLowerCase(),
          createdAt,
        }
      })

    let rawTickets: MaintenanceTicketRecord[] = []
    try {
      let orderedRef = ref.orderBy('createdAt', 'desc')
      if (cursorCreatedAt > 0) orderedRef = orderedRef.startAfter(cursorCreatedAt)
      const snap = await orderedRef.limit(Math.max(limit + 1, 100)).get()
      rawTickets = mapTickets(snap)
    } catch (queryErr: unknown) {
      const message = queryErr instanceof Error ? queryErr.message : ''
      const needsIndex = message.toLowerCase().includes('index')
      if (!needsIndex) throw queryErr
      let orderedFallbackRef = fallbackRef.orderBy('createdAt', 'desc')
      if (cursorCreatedAt > 0) orderedFallbackRef = orderedFallbackRef.startAfter(cursorCreatedAt)
      const fallbackSnap = await orderedFallbackRef.limit(Math.max(limit + 1, 500)).get()
      rawTickets = mapTickets(fallbackSnap)
    }

    let tickets = rawTickets

    if (code) {
      tickets = tickets.filter((t) => {
        const ticketCode = String(t.ticketCode || '').toUpperCase()
        const incident = String(t.incidentNumber || '').toUpperCase()
        return ticketCode === code || incident === code
      })
    }
    if (assignedToId && !canViewAllTickets) {
      tickets = tickets.filter((t) => {
        const assignedIds = Array.isArray((t as any).assignedToIds) ? (t as any).assignedToIds.map(String) : []
        const assignedNames = Array.isArray((t as any).assignedToNames)
          ? (t as any).assignedToNames.map((name: unknown) => normalizeName(String(name || '')))
          : []
        const effectiveAssignedId = user.id || assignedToId
        return assignedIds.includes(effectiveAssignedId) || (!!sessionName && assignedNames.includes(sessionName))
      })
    }
    if (ticketType === 'maquinaria') {
      tickets = tickets.filter((t) => String(t.ticketType || 'maquinaria').toLowerCase() !== 'deco')
    } else if (ticketType && ticketType !== 'all' && ticketType !== 'deco') {
      tickets = tickets.filter((t) => String(t.ticketType || '').toLowerCase() === ticketType)
    }
    if ((start || end) && dateMode !== 'all') {
      const startMs = start ? new Date(`${start}T00:00:00.000Z`).getTime() : null
      const endMs = end ? new Date(`${end}T23:59:59.999Z`).getTime() : null
      tickets = tickets.filter((t) => {
        const timelineMs = getTicketDateByMode(t, dateMode)
        if (timelineMs === null) return false
        if (startMs !== null && timelineMs < startMs) return false
        if (endMs !== null && timelineMs > endMs) return false
        return true
      })
    }
    if (cursorCreatedAt > 0) {
      tickets = tickets.filter((t) => {
        const createdAtMs =
          typeof t.createdAt === 'string' ? new Date(t.createdAt).getTime() : Number(t.createdAt || 0)
        return createdAtMs > 0 && createdAtMs < cursorCreatedAt
      })
    }

    const slicedTickets = tickets.slice(0, limit)
    const hasMore = tickets.length > limit
    const nextCursorCreatedAt = hasMore
      ? (() => {
          const last = slicedTickets[slicedTickets.length - 1]
          if (!last) return null
          return typeof last.createdAt === 'string'
            ? new Date(last.createdAt).getTime()
            : Number(last.createdAt || 0) || null
        })()
      : null

    console.info('[maintenance/tickets] completed', {
      durationMs: Date.now() - startedAt,
      role,
      status,
      priority,
      location,
      ticketType,
      hasCode: Boolean(code),
      hasDateRange: Boolean(start || end),
      dateMode,
      assignedToId: assignedToId || (role === 'treballador' ? user.id : ''),
      requestedLimit: limit,
      returned: slicedTickets.length,
      rawRows: rawTickets.length,
      hasMore,
    })

    return NextResponse.json({ tickets: slicedTickets, hasMore, nextCursorCreatedAt })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[maintenance/tickets] failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (
    role !== 'admin' &&
    role !== 'direccio' &&
    role !== 'cap' &&
    role !== 'treballador' &&
    role !== 'comercial' &&
    role !== 'usuari'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as TicketPayload
    const location = (body.location || '').trim()
    const machine = (body.machine || '').trim()
    const description = (body.description || '').trim()
    const priority = normalizePriority(body.priority)
    const status = normalizeStatus(body.status)
    const ticketType =
      body.ticketType === 'deco' || body.ticketType === 'maquinaria'
        ? body.ticketType
        : 'maquinaria'

    const isWhatsBlapp = body.source === 'whatsblapp'

    if (!location || !description || (!isWhatsBlapp && !machine)) {
      return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
    }

    const now = Date.now()
    const incidentNumber = (body.incidentNumber || '').trim()
    const ticketCode = incidentNumber || (await generateTicketCode())
    const doc = await db.collection('maintenanceTickets').add({
      ticketCode,
      incidentNumber: incidentNumber || null,
      location,
      workLocation: null,
      machine: machine || '',
      description,
      operatorTitle: null,
      priority,
      status,
      createdAt: now,
      createdById: user.id,
      createdByName: user.name || '',
      assignedToIds: [],
      assignedToNames: [],
      assignedAt: null,
      assignedById: null,
      assignedByName: null,
      plannedStart: body.plannedStart || null,
      plannedEnd: body.plannedEnd || null,
      estimatedMinutes: body.estimatedMinutes || null,
      ticketType,
      source: body.source || 'manual',
      imageUrl: body.imageUrl || null,
      imagePath: body.imagePath || null,
      imageMeta: body.imageMeta || null,
      needsVehicle: false,
      vehicleType: null,
      vehicleId: null,
      vehiclePlate: null,
      externalized: false,
      supplierName: null,
      supplierEmail: null,
      externalReference: null,
      externalStatus: null,
      externalSentAt: null,
      externalSentById: null,
      externalSentByName: null,
      externalizationHistory: [],
      statusHistory: [
        {
          status,
          at: now,
          byId: user.id,
          byName: user.name || '',
        },
      ],
    })

    await notifyMaintenanceManagers({
      payload: {
        type: 'maintenance_ticket_new',
        title: 'Nou ticket de manteniment',
        body: buildTicketBody({ machine, location, description }),
        ticketId: doc.id,
        ticketCode,
        status,
        priority,
        location,
        machine,
        source: body.source || 'manual',
      },
      excludeIds: [user.id],
    })

    const mediaPath = String(body.imagePath || '').trim()
    if (mediaPath) {
      void registerMediaRef({
        path: mediaPath,
        source: 'maintenance',
        firestoreDocId: doc.id,
        url: body.imageUrl || null,
        size:
          typeof body.imageMeta?.size === 'number' && Number.isFinite(body.imageMeta.size)
            ? body.imageMeta.size
            : null,
        contentType: body.imageMeta?.type ? String(body.imageMeta.type) : null,
        title: [ticketCode, location, description.slice(0, 80)].filter(Boolean).join(' · '),
        createdAt: now,
      })
    }

    return NextResponse.json({ id: doc.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
