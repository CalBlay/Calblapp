import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  canManageAllMaintenanceTickets,
  canManageMaintenanceTicketInbox,
  canViewQualitatCuinaCentralMaintenanceTickets,
} from '@/lib/server/maintenanceTicketsAccess'
import {
  MAINTENANCE_TICKETS_PATH,
  requireMaintenanceTicketApiEdit,
  requireMaintenanceTicketApiView,
} from '@/lib/server/maintenanceApiAuth'
import {
  buildTicketBody,
  notifyForNewMaintenanceTicket,
} from '@/lib/maintenanceNotifications'
import { registerMediaRef } from '@/lib/media/storageMediaIndex'
import { resolveOpsChannelByLocationName } from '@/lib/opsMessagingChannels'
import { resolveManualTicketRouting } from '@/lib/maintenanceTicketCreators'
import {
  fetchQualitatCuinaCentralTicketDocs,
  getCuinaCentralUserIds,
  isQualitatVisibleCuinaCentralTicket,
} from '@/lib/server/qualitatCuinaCentralTickets'
import { getMaintenanceDateRangeMs } from '@/lib/maintenanceDateFilter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
}

type TicketImagePayload = {
  url?: string | null
  path?: string | null
  meta?: { size?: number; type?: string } | null
}

type TicketPayload = {
  location?: string
  workLocation?: string | null
  zone?: string | null
  machine?: string
  description?: string
  operatorTitle?: string | null
  workerName?: string | null
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  ticketType?: 'maquinaria' | 'deco'
  imageUrl?: string | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
  images?: TicketImagePayload[]
  source?: 'manual' | 'incidencia' | 'whatsblapp' | 'manual_cuina_central'
  intakeChannel?:
    | 'restaurant'
    | 'finca'
    | 'incidencia'
    | 'ops'
    | 'manual_tickets'
    | 'manual_cuina_central'
    | 'other'
  status?: string
  incidentNumber?: string
  plannedStart?: number | null
  plannedEnd?: number | null
  estimatedMinutes?: number | null
  sourceChannelId?: string | null
}

type MaintenanceTicketRecord = Record<string, unknown> & {
  ticketCode?: string
  incidentNumber?: string
  status?: string
  priority?: string
  ticketType?: string
  location?: string | null
  source?: string | null
  intakeChannel?: string | null
  createdById?: string | null
  createdAt?: string | number | { toDate?: () => Date }
  plannedStart?: string | number | null
  assignedAt?: string | number | null
  externalized?: boolean
  workflowStage?: string | null
  externalSentAt?: string | number | { toDate?: () => Date } | null
  supplierName?: string | null
  supplierEmail?: string | null
  externalizationHistory?: unknown[]
  statusHistory?: Array<{ status?: string; at?: string | number | { toDate?: () => Date } | null }>
}

const hasExternalizationTrace = (ticket: MaintenanceTicketRecord) => {
  if (ticket.externalized === true) return true
  if (String(ticket.workflowStage || '').trim() === 'externalized') return true
  if (ticket.externalSentAt != null && String(ticket.externalSentAt).trim() !== '') return true
  if (String(ticket.supplierName || '').trim()) return true
  if (String(ticket.supplierEmail || '').trim()) return true
  return Array.isArray(ticket.externalizationHistory) && ticket.externalizationHistory.length > 0
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
  if (v === 'reassignat') return 'reassignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut') return 'fet'
  if (v === 'validat') return 'validat'
  return 'nou'
}

const MAX_TICKET_IMAGES = 3

function normalizeTicketImages(body: TicketPayload): TicketImagePayload[] {
  if (Array.isArray(body.images) && body.images.length > 0) {
    return body.images
      .map((image) => ({
        url: String(image?.url || '').trim() || null,
        path: String(image?.path || '').trim() || null,
        meta: image?.meta || null,
      }))
      .filter((image) => image.url || image.path)
  }

  const legacyUrl = String(body.imageUrl || '').trim()
  const legacyPath = String(body.imagePath || '').trim()
  if (legacyUrl || legacyPath) {
    return [
      {
        url: legacyUrl || null,
        path: legacyPath || null,
        meta: body.imageMeta || null,
      },
    ]
  }

  return []
}

const normalizeIntakeChannel = (value?: string, source?: string) => {
  const v = (value || '').trim().toLowerCase()
  if (v === 'restaurant') return 'restaurant'
  if (v === 'finca') return 'finca'
  if (v === 'incidencia') return 'incidencia'
  if (v === 'ops') return 'ops'
  if (v === 'manual_cuina_central') return 'manual_cuina_central'
  if (v === 'manual_tickets') return 'manual_tickets'
  if (v === 'other') return 'other'
  if (source === 'incidencia') return 'incidencia'
  if (source === 'manual_cuina_central') return 'manual_cuina_central'
  return 'manual_tickets'
}

const getInitialWorkflowStage = (params: {
  source?: string
  intakeChannel?: string
  assigned?: boolean
  externalized?: boolean
}) => {
  if (params.externalized) return 'externalized'
  if (params.assigned) return 'planned_internal'
  if (params.source === 'manual_cuina_central' || params.intakeChannel === 'manual_cuina_central') {
    return 'planner_queue'
  }
  return 'tickets_inbox'
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

  if (mode === 'planned') return toMs(ticket.plannedStart) ?? toMs(ticket.createdAt)
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
  const auth = await requireMaintenanceTicketApiView()
  if (!auth.ok) return auth.res

  const user = auth.user as SessionUser
  const role = auth.role
  const sessionName = normalizeName(user.name || '')

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
    (await canManageAllMaintenanceTickets(user)) || (await canManageMaintenanceTicketInbox(user))
  const canViewQualitatCuinaCentral = canViewQualitatCuinaCentralMaintenanceTickets(user)
  const cuinaCentralUserIds = canViewQualitatCuinaCentral
    ? new Set(await getCuinaCentralUserIds())
    : null

  try {
    let ref: FirebaseFirestore.Query = db.collection('maintenanceTickets')
    if (status && status !== 'all') ref = ref.where('status', '==', status)
    if (priority && priority !== 'all') ref = ref.where('priority', '==', priority)
    if (location) ref = ref.where('location', '==', location)
    const shouldQueryDecoOnly = ticketType === 'deco'
    if (shouldQueryDecoOnly) {
      ref = ref.where('ticketType', '==', 'deco')
    }

    const qualitatScopedQuery = canViewQualitatCuinaCentral && !canViewAllTickets

    if (assignedToId && canViewAllTickets) {
      ref = ref.where('assignedToIds', 'array-contains', assignedToId)
    } else if (!qualitatScopedQuery && !canViewAllTickets && !assignedToId && user.id) {
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
          externalized: hasExternalizationTrace(data),
          createdAt,
        }
      })

    let rawTickets: MaintenanceTicketRecord[] = []
    if (qualitatScopedQuery) {
      const docs = await fetchQualitatCuinaCentralTicketDocs({
        baseRef: ref,
        cuinaCentralUserIds: Array.from(cuinaCentralUserIds || []),
        viewerUserId: user.id,
        limit,
      })
      rawTickets = docs.map((doc) => {
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
          externalized: hasExternalizationTrace(data),
          createdAt,
        }
      })
    } else {
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
    }

    let tickets = rawTickets

    if (qualitatScopedQuery && cuinaCentralUserIds) {
      tickets = tickets.filter((ticket) =>
        isQualitatVisibleCuinaCentralTicket(ticket, cuinaCentralUserIds, user.id)
      )
    }

    if (code) {
      tickets = tickets.filter((t) => {
        const ticketCode = String(t.ticketCode || '').toUpperCase()
        const incident = String(t.incidentNumber || '').toUpperCase()
        return ticketCode === code || incident === code
      })
    }
    if (assignedToId && !canViewAllTickets) {
      tickets = tickets.filter((t) => {
        const assignedIds = Array.isArray(t.assignedToIds) ? t.assignedToIds.map(String) : []
        const assignedNames = Array.isArray(t.assignedToNames)
          ? t.assignedToNames.map((name: unknown) => normalizeName(String(name || '')))
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
      const { startMs, endMs } =
        start && end ? getMaintenanceDateRangeMs(start, end) : { startMs: null, endMs: null }
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
  const auth = await requireMaintenanceTicketApiEdit(MAINTENANCE_TICKETS_PATH)
  if (!auth.ok) return auth.res

  const user = auth.user as SessionUser

  try {
    const body = (await req.json()) as TicketPayload
    const location = (body.location || '').trim()
    const workLocation = String(body.workLocation || '').trim() || null
    const zone = String(body.zone || '').trim() || null
    const machine = (body.machine || '').trim()
    const description = (body.description || '').trim()
    const workerName = String(body.workerName || '').trim()
    const priority = normalizePriority(body.priority)
    const status = normalizeStatus(body.status)
    const ticketType =
      body.ticketType === 'deco' || body.ticketType === 'maquinaria'
        ? body.ticketType
        : 'maquinaria'

    const isWhatsBlapp = body.source === 'whatsblapp'
    const isIncidencia = body.source === 'incidencia'
    const manualRouting =
      !isWhatsBlapp && !isIncidencia
        ? resolveManualTicketRouting({ department: user.department, location })
        : null
    const opsChannel = resolveOpsChannelByLocationName(location)
    const source = manualRouting?.source || body.source || 'manual'
    const intakeChannel = manualRouting
      ? manualRouting.intakeChannel
      : normalizeIntakeChannel(body.intakeChannel, body.source)
    const requiresWorkerName = !isWhatsBlapp && !isIncidencia
    const sourceChannelId =
      String(body.sourceChannelId || '').trim() || opsChannel?.channelId || null
    const images = normalizeTicketImages(body)
    const requiresManualImages = !isWhatsBlapp && !isIncidencia

    if (!location || !description || (!isWhatsBlapp && !machine)) {
      return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
    }

    if (requiresWorkerName && !workerName) {
      return NextResponse.json({ error: 'Cal indicar el nom del treballador' }, { status: 400 })
    }

    if (requiresManualImages) {
      if (images.length < 1) {
        return NextResponse.json(
          { error: 'Cal adjuntar com a minim una foto o video (maxim 3).' },
          { status: 400 }
        )
      }
      if (images.length > MAX_TICKET_IMAGES) {
        return NextResponse.json({ error: 'Com a maxim es permeten 3 adjunts.' }, { status: 400 })
      }
    }

    const primaryImage = images[0] || null
    const imageUrls = images.map((image) => image.url).filter((url): url is string => Boolean(url))

    const now = Date.now()
    const incidentNumber = (body.incidentNumber || '').trim()
    const ticketCode = incidentNumber || (await generateTicketCode())
    const workflowStage =
      manualRouting?.workflowStage ||
      getInitialWorkflowStage({
        source,
        intakeChannel,
        assigned: Boolean(body.plannedStart && body.plannedEnd),
        externalized: false,
      })

    const doc = await db.collection('maintenanceTickets').add({
      ticketCode,
      incidentNumber: incidentNumber || null,
      location,
      workLocation,
      zone,
      machine: machine || '',
      description,
      operatorTitle: String(body.operatorTitle || body.machine || '').trim() || null,
      priority,
      status,
      createdAt: now,
      createdById: user.id,
      createdByName: user.name || '',
      workerName: workerName || null,
      assignedToIds: [],
      assignedToNames: [],
      assignedAt: null,
      assignedById: null,
      assignedByName: null,
      plannedStart: body.plannedStart || null,
      plannedEnd: body.plannedEnd || null,
      estimatedMinutes: body.estimatedMinutes || null,
      ticketType,
      source,
      intakeChannel,
      sourceChannelId,
      workflowStage,
      imageUrl: primaryImage?.url || null,
      imagePath: primaryImage?.path || null,
      imageMeta: primaryImage?.meta || null,
      imageUrls: imageUrls.length ? imageUrls : null,
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
      resolutionCategory: null,
      resolutionNote: null,
      resolvedByArea: null,
      resolvedAt: null,
      resolvedById: null,
      resolvedByName: null,
      externalizationHistory: [],
      statusHistory: [
        {
          status,
          at: now,
          byId: user.id,
          byName: user.name || '',
        },
      ],
      workLogs: [],
    })

    await notifyForNewMaintenanceTicket({
      workflowStage,
      payload: {
        type: 'maintenance_ticket_new',
        title: 'Nou ticket de manteniment',
        body: [
          buildTicketBody({ machine, location, description }),
          workerName ? `Treballador: ${workerName}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        ticketId: doc.id,
        ticketCode,
        status,
        priority,
        location,
        machine,
        source,
      },
      excludeIds: [user.id],
    })

    for (const image of images) {
      const mediaPath = String(image.path || '').trim()
      if (!mediaPath) continue
      void registerMediaRef({
        path: mediaPath,
        source: 'maintenance',
        firestoreDocId: doc.id,
        url: image.url || null,
        size:
          typeof image.meta?.size === 'number' && Number.isFinite(image.meta.size)
            ? image.meta.size
            : null,
        contentType: image.meta?.type ? String(image.meta.type) : null,
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
