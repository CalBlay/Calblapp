import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  canDeleteMaintenanceTickets,
  canManageAllMaintenanceTickets,
  canManageMaintenanceTicketInbox,
  canReopenMaintenanceTickets,
  canValidateMaintenanceTickets,
} from '@/lib/server/maintenanceTicketsAccess'
import { canUserDeleteMaintenanceTicket } from '@/lib/maintenanceTicketDeletePolicy'
import { clearStaleMaintenanceTicketNotifications } from '@/lib/maintenanceNotifications'
import { requireMaintenanceTicketApiView } from '@/lib/server/maintenanceApiAuth'
import {
  buildAssignedTicketBodyForCreator,
  buildTicketBody,
  notifyMaintenanceAssignees,
  notifyTicketCreator,
  notifyTicketEnteredPlanner,
  notifyTicketPendingCapValidation,
  notifyTicketResolvedForCreator,
  onMaintenanceTicketUpdated,
} from '@/lib/maintenanceNotifications'
import {
  canCreatorValidateMaintenanceTicket,
  maintenanceTicketRequiresCreatorValidation,
} from '@/lib/maintenanceTicketValidation'
import {
  normalizeTicketWorkflowStage,
  type TicketAlertSnapshot,
} from '@/lib/maintenanceTicketAlerts'
import {
  applyStatusHistoryUpdate,
  validateJourneyStatusPayload,
  type JourneyStatus,
  type StatusHistoryEntry,
} from '@/lib/maintenanceJourneyStatus'
import {
  syncMaintenanceTicketOutlookCalendar,
  type MaintenanceTicketOutlookEventRef,
} from '@/lib/maintenanceTicketOutlook'
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
  workflowStage?:
    | 'tickets_inbox'
    | 'planner_queue'
    | 'planned_internal'
    | 'externalized'
    | 'resolved_admin'
    | 'resolved_planner'
    | 'closed'
  intakeChannel?:
    | 'restaurant'
    | 'finca'
    | 'incidencia'
    | 'ops'
    | 'manual_tickets'
    | 'manual_cuina_central'
    | 'other'
  assignedToIds?: string[]
  assignedToNames?: string[]
  needsVehicle?: boolean
  vehicleType?: string | null
  vehicleId?: string | null
  vehiclePlate?: string | null
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  location?: string
  workLocation?: string | null
  machine?: string
  description?: string
  operatorTitle?: string | null
  plannedStart?: number | null
  plannedEnd?: number | null
  estimatedMinutes?: number | null
  supplierResolvedAt?: number | null
  externalStatus?: 'sent' | 'resent' | 'answered' | 'closed' | null
  resolutionCategory?: string | null
  resolutionNote?: string | null
  resolvedByArea?: 'administracio' | 'manteniment' | 'tecnic' | 'proveidor' | null
  statusStartTime?: string | null
  statusEndTime?: string | null
  newSegmentEndTime?: string | null
  statusNote?: string | null
  validationApproval?: 'creator' | 'cap'
  completionImages?: Array<{
    url?: string | null
    path?: string | null
    meta?: { size?: number; type?: string; name?: string } | null
  }>
}

type MaintenanceTicketRecord = Record<string, unknown> & {
  status?: string
  ticketCode?: string
  incidentNumber?: string
  ticketType?: string
  createdById?: string
  createdByName?: string
  assignedToIds?: string[]
  assignedToNames?: string[]
  machine?: string
  location?: string
  workLocation?: string | null
  description?: string
  operatorTitle?: string | null
  priority?: string
  source?: string
  workflowStage?: string | null
  externalized?: boolean
  plannedStart?: number | string | null
  plannedEnd?: number | string | null
  outlookCalendarEvents?: Record<string, MaintenanceTicketOutlookEventRef>
  statusHistory?: StatusHistoryEntry[]
  imageUrls?: string[] | null
  completionAttachments?: Array<{
    url?: string | null
    path?: string | null
    meta?: { size?: number; type?: string; name?: string } | null
  }> | null
  requiresCreatorValidation?: boolean
  creatorValidatedAt?: number | string | null
  capValidatedAt?: number | string | null
  resolvedByArea?: string | null
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
  if (v === 'resolut') return 'resolut'
  if (v === 'validat') return 'validat'
  return 'nou'
}

const normalizeName = (value?: string) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate().getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const normalizeWorkflowStage = (value?: string | null) => {
  const v = (value || '').trim().toLowerCase()
  if (v === 'planner_queue') return 'planner_queue'
  if (v === 'planned_internal') return 'planned_internal'
  if (v === 'externalized') return 'externalized'
  if (v === 'resolved_admin') return 'resolved_admin'
  if (v === 'resolved_planner') return 'resolved_planner'
  if (v === 'closed') return 'closed'
  return 'tickets_inbox'
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireMaintenanceTicketApiView()
  if (!auth.ok) return auth.res

  const user = auth.user as SessionUser

  const { id } = await ctx.params

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = snap.data() as MaintenanceTicketRecord
    const canViewAllTickets =
      (await canManageAllMaintenanceTickets(user)) || (await canManageMaintenanceTicketInbox(user))

    const assignedIds = Array.isArray(data.assignedToIds) ? data.assignedToIds.map(String) : []
    const assignedNames = Array.isArray(data.assignedToNames)
      ? data.assignedToNames.map((name) => normalizeName(String(name || '')))
      : []
    const sessionName = normalizeName(user.name || '')
    const canViewAssignedTicket =
      assignedIds.includes(String(user.id || '')) ||
      (!!sessionName && assignedNames.includes(sessionName))

    if (!canViewAllTickets && data.createdById !== user.id && !canViewAssignedTicket) {
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
  const auth = await requireMaintenanceTicketApiView()
  if (!auth.ok) return auth.res

  const user = auth.user as SessionUser
  const canManageTickets = await canManageAllMaintenanceTickets(user)
  const canValidate = await canValidateMaintenanceTickets(user)
  const canReopen = await canReopenMaintenanceTickets(user)
  const role = auth.role

  const { id } = await ctx.params
  const body = (await req.json()) as UpdatePayload

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const current = snap.data() as MaintenanceTicketRecord
    const previousWorkflowStage = normalizeTicketWorkflowStage(current.workflowStage)

    if (role === 'treballador' && !canManageTickets) {
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
        body.vehicleType !== undefined ||
        body.vehicleId !== undefined ||
        body.vehiclePlate !== undefined ||
        body.priority !== undefined ||
        body.location !== undefined ||
        body.workLocation !== undefined ||
      body.machine !== undefined ||
      body.description !== undefined ||
      body.operatorTitle !== undefined
      if (wantsAssign) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedById: user.id,
      updatedByName: user.name || '',
    }
    const buildMergedCompletionAttachments = () => {
      const newAttachments = Array.isArray(body.completionImages)
        ? body.completionImages
            .map((item) => ({
              url: String(item?.url || '').trim() || null,
              path: String(item?.path || '').trim() || null,
              meta: item?.meta || null,
            }))
            .filter((item) => item.url || item.path)
        : []

      const existing = Array.isArray(current.completionAttachments)
        ? current.completionAttachments
            .map((item) => ({
              url: String(item?.url || '').trim() || null,
              path: String(item?.path || '').trim() || null,
              meta:
                item?.meta && typeof item.meta === 'object'
                  ? {
                      size: typeof item.meta.size === 'number' ? item.meta.size : undefined,
                      type: String(item.meta.type || '').trim() || undefined,
                      name: String(item.meta.name || '').trim() || undefined,
                    }
                  : null,
            }))
            .filter((item) => item.url || item.path)
        : []

      return { newAttachments, merged: [...existing, ...newAttachments] }
    }

    let nextStatus = body.status ? normalizeStatus(body.status) : null
    const nextPriority = body.priority ? normalizePriority(body.priority) : null
    const currentStatus = normalizeStatus(current.status)
    const validationApproval =
      body.validationApproval === 'creator' || body.validationApproval === 'cap'
        ? body.validationApproval
        : null

    if (validationApproval === 'creator') {
      if (!canCreatorValidateMaintenanceTicket(current, user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const now = Date.now()
      const ticketCode = current.ticketCode || current.incidentNumber || null
      const notifyBase = {
        ticketId: id,
        ticketCode,
        status: 'resolut' as const,
        priority: current.priority || null,
        location: current.location || null,
        machine: current.machine || null,
        source: current.source || null,
        body: buildTicketBody({
          machine: current.machine,
          location: current.location,
          description: current.description,
        }),
      }

      const creatorUpdates: Record<string, unknown> = {
        creatorValidatedAt: now,
        creatorValidatedById: user.id,
        creatorValidatedByName: user.name || '',
        updatedAt: now,
      }

      if (current.capValidatedAt) {
        creatorUpdates.status = 'validat'
        creatorUpdates.workflowStage = 'closed'
        creatorUpdates.resolvedAt = now
        creatorUpdates.resolvedById = user.id
        creatorUpdates.resolvedByName = user.name || ''
        creatorUpdates.statusHistory = admin.firestore.FieldValue.arrayUnion({
          status: 'validat',
          at: now,
          byId: user.id,
          byName: user.name || '',
          note: 'Validat pel creador',
        })
      }

      await ref.set(creatorUpdates, { merge: true })

      if (!current.capValidatedAt) {
        await notifyTicketPendingCapValidation({
          payload: {
            type: 'maintenance_ticket_pending_cap_validation',
            title: 'Ticket pendent de validar',
            ...notifyBase,
          },
          excludeIds: [user.id],
        })
      } else {
        await notifyTicketCreator({
          uid: current.createdById || null,
          payload: {
            type: 'maintenance_ticket_validated',
            title: 'Ticket validat',
            ...notifyBase,
            status: 'validat',
          },
          excludeIds: [user.id],
        })
      }

      const updatedSnap = await ref.get()
      return NextResponse.json({ ticket: { id, ...(updatedSnap.data() || {}) } })
    }

    const wantsCapValidation = validationApproval === 'cap' || nextStatus === 'validat'

    const wantsDataEdit =
      body.assignedToIds !== undefined ||
      body.assignedToNames !== undefined ||
      body.needsVehicle !== undefined ||
      body.vehicleType !== undefined ||
      body.vehicleId !== undefined ||
      body.vehiclePlate !== undefined ||
      body.priority !== undefined ||
      body.location !== undefined ||
      body.workLocation !== undefined ||
      body.machine !== undefined ||
      body.description !== undefined ||
      body.operatorTitle !== undefined ||
      body.plannedStart !== undefined ||
      body.plannedEnd !== undefined ||
      body.estimatedMinutes !== undefined ||
      body.supplierResolvedAt !== undefined

    if (currentStatus === 'validat') {
      const onlyReopenRequest =
        (nextStatus === 'fet' || nextStatus === 'resolut') &&
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
    if (body.workflowStage !== undefined) {
      updates.workflowStage = normalizeWorkflowStage(body.workflowStage)
    }
    if (body.intakeChannel !== undefined) {
      updates.intakeChannel = String(body.intakeChannel || '').trim() || null
    }
    if (nextPriority) updates.priority = nextPriority
    if (body.location !== undefined) updates.location = String(body.location).trim()
    if (body.workLocation !== undefined) updates.workLocation = String(body.workLocation || '').trim() || null
    if (body.machine !== undefined) updates.machine = String(body.machine).trim()
    if (body.description !== undefined) updates.description = String(body.description).trim()
    if (body.operatorTitle !== undefined) updates.operatorTitle = String(body.operatorTitle || '').trim()
    if (body.assignedToIds !== undefined) updates.assignedToIds = body.assignedToIds
    if (body.assignedToNames !== undefined) updates.assignedToNames = body.assignedToNames
    if (body.needsVehicle !== undefined) updates.needsVehicle = body.needsVehicle
    if (body.vehicleType !== undefined) updates.vehicleType = body.vehicleType
    if (body.vehicleId !== undefined) updates.vehicleId = body.vehicleId
    if (body.vehiclePlate !== undefined) updates.vehiclePlate = body.vehiclePlate
    if (body.plannedStart !== undefined) updates.plannedStart = body.plannedStart
    if (body.plannedEnd !== undefined) updates.plannedEnd = body.plannedEnd
    if (body.estimatedMinutes !== undefined) updates.estimatedMinutes = body.estimatedMinutes
    if (body.supplierResolvedAt !== undefined) updates.supplierResolvedAt = body.supplierResolvedAt
    if (body.externalStatus !== undefined) updates.externalStatus = body.externalStatus
    if (body.resolutionCategory !== undefined) {
      updates.resolutionCategory = String(body.resolutionCategory || '').trim() || null
    }
    if (body.resolutionNote !== undefined) {
      updates.resolutionNote = String(body.resolutionNote || '').trim() || null
    }
    if (body.resolvedByArea !== undefined) {
      updates.resolvedByArea = String(body.resolvedByArea || '').trim() || null
    }

    const planningTouched =
      body.plannedStart !== undefined ||
      body.plannedEnd !== undefined ||
      body.assignedToIds !== undefined ||
      body.assignedToNames !== undefined

    const previousPlannedStart = toMillis(current.plannedStart)
    const previousPlannedEnd = toMillis(current.plannedEnd)
    const nextPlannedStart =
      body.plannedStart !== undefined ? toMillis(body.plannedStart) : previousPlannedStart
    const nextPlannedEnd =
      body.plannedEnd !== undefined ? toMillis(body.plannedEnd) : previousPlannedEnd
    const previousHadPlanning = previousPlannedStart !== null && previousPlannedEnd !== null
    const nextHasPlanning = nextPlannedStart !== null && nextPlannedEnd !== null
    const planningChanged =
      previousPlannedStart !== nextPlannedStart ||
      previousPlannedEnd !== nextPlannedEnd ||
      body.assignedToIds !== undefined ||
      body.assignedToNames !== undefined

    if (planningTouched && planningChanged) {
      let planningAction: 'planificat' | 'replanificat' | 'desplanificat' | null = null
      if (!previousHadPlanning && nextHasPlanning) planningAction = 'planificat'
      if (previousHadPlanning && !nextHasPlanning) planningAction = 'desplanificat'
      if (previousHadPlanning && nextHasPlanning) planningAction = 'replanificat'

      if (planningAction) {
        updates.planningHistory = admin.firestore.FieldValue.arrayUnion({
          action: planningAction,
          at: Date.now(),
          byId: user.id,
          byName: user.name || '',
          plannedStart: nextPlannedStart,
          plannedEnd: nextPlannedEnd,
          previousPlannedStart,
          previousPlannedEnd,
          assignedToNames:
            body.assignedToNames !== undefined
              ? body.assignedToNames
              : Array.isArray(current.assignedToNames)
                ? current.assignedToNames
                : [],
          note:
            planningAction === 'desplanificat'
              ? 'Torna a pendents'
              : planningAction === 'replanificat'
                ? 'Canvi de franja o assignacio'
                : '',
        })
      }
    }

    if (body.assignedToIds !== undefined) {
      updates.assignedAt = body.assignedToIds.length ? Date.now() : null
      updates.assignedById = user.id
      updates.assignedByName = user.name || ''
      if (body.assignedToIds.length > 0) {
        updates.workflowStage = 'planned_internal'
      } else if (normalizeWorkflowStage(String(current.workflowStage || '')) === 'planned_internal') {
        updates.workflowStage = 'planner_queue'
      }
      const currentStatus = normalizeStatus(current.status)
      if (!nextStatus && body.assignedToIds.length > 0 && currentStatus === 'nou') {
        nextStatus = 'assignat'
        updates.status = nextStatus
      }
    }

    if (wantsCapValidation) {
      if (!canValidate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const requiresCreatorValidation = maintenanceTicketRequiresCreatorValidation(current)
      if (
        currentStatus !== 'fet' &&
        currentStatus !== 'resolut' &&
        !requiresCreatorValidation
      ) {
        return NextResponse.json({ error: 'Nomes es pot validar des de Fet o Resolt' }, { status: 400 })
      }

      const now = Date.now()
      updates.capValidatedAt = now
      updates.capValidatedById = user.id
      updates.capValidatedByName = user.name || ''

      const creatorAlreadyValidated = Boolean(current.creatorValidatedAt)
      if (requiresCreatorValidation && !creatorAlreadyValidated) {
        nextStatus = 'resolut'
        updates.status = 'resolut'
      } else {
        nextStatus = 'validat'
        updates.status = 'validat'
        updates.resolvedAt = now
        updates.resolvedById = user.id
        updates.resolvedByName = user.name || ''
        updates.workflowStage = current.externalized ? 'externalized' : 'closed'
      }
    } else if (nextStatus === 'validat') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (role === 'treballador' && !canManageTickets && nextStatus) {
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
      if (role === 'treballador' && !canManageTickets) {
        const journeyError = validateJourneyStatusPayload({
          currentStatus: currentStatus as JourneyStatus,
          nextStatus: nextStatus as JourneyStatus,
          closeSegmentEndTime: body.statusEndTime ?? undefined,
          newSegmentStartTime: body.statusStartTime ?? undefined,
          newSegmentEndTime: body.newSegmentEndTime ?? body.statusEndTime ?? undefined,
          note: body.statusNote ?? undefined,
          completionImageCount: Array.isArray(body.completionImages)
            ? body.completionImages.length
            : 0,
        })
        if (journeyError) {
          return NextResponse.json({ error: journeyError }, { status: 400 })
        }
      }

      const history = Array.isArray(current.statusHistory)
        ? (current.statusHistory as StatusHistoryEntry[])
        : []

      const closeEnd = String(body.statusEndTime || '').trim() || null
      const newStart = String(body.statusStartTime || '').trim() || null
      const newEnd =
        String(body.newSegmentEndTime || body.statusEndTime || '').trim() || null

      updates.statusHistory = applyStatusHistoryUpdate(
        history,
        currentStatus as JourneyStatus,
        nextStatus as JourneyStatus,
        {
          closeSegmentEndTime: closeEnd,
          newSegmentStartTime: newStart,
          newSegmentEndTime: newEnd,
          note: body.statusNote ?? null,
          userId: user.id,
          userName: user.name || '',
        }
      )

      if (Array.isArray(body.completionImages) && body.completionImages.length > 0) {
        const { newAttachments, merged } = buildMergedCompletionAttachments()
        if (
          nextStatus === 'fet' &&
          role === 'treballador' &&
          !canManageTickets &&
          newAttachments.length < 1
        ) {
          return NextResponse.json(
            { error: 'Cal adjuntar com a minim un fitxer o foto en marcar Fet.' },
            { status: 400 }
          )
        }
        updates.completionAttachments = merged
      } else if (nextStatus === 'fet' && role === 'treballador' && !canManageTickets) {
        return NextResponse.json(
          { error: 'Cal adjuntar com a minim un fitxer o foto en marcar Fet.' },
          { status: 400 }
        )
      }
    }

    if (
      updates.workflowStage === 'resolved_admin' ||
      updates.workflowStage === 'resolved_planner'
    ) {
      updates.resolvedAt = Date.now()
      updates.resolvedById = user.id
      updates.resolvedByName = user.name || ''
      updates.status = 'resolut'
      nextStatus = 'resolut'
      updates.creatorValidatedAt = null
      updates.creatorValidatedById = null
      updates.creatorValidatedByName = null
      updates.capValidatedAt = null
      updates.capValidatedById = null
      updates.capValidatedByName = null
      if (updates.workflowStage === 'resolved_admin') {
        updates.requiresCreatorValidation = true
      } else {
        updates.requiresCreatorValidation = false
      }
      if (
        Array.isArray(body.completionImages) &&
        body.completionImages.length > 0 &&
        updates.completionAttachments === undefined
      ) {
        updates.completionAttachments = buildMergedCompletionAttachments().merged
      }
      updates.statusHistory = admin.firestore.FieldValue.arrayUnion({
        status: 'resolut',
        at: Date.now(),
        byId: user.id,
        byName: user.name || '',
        startTime: body.statusStartTime ?? null,
        endTime: body.statusEndTime ?? null,
        note: body.statusNote ?? body.resolutionNote ?? '',
      })
    }

    await ref.set(updates, { merge: true })

    const updatedSnap = await ref.get()
    const updated = (updatedSnap.data() || {}) as typeof current

    const nextWorkflowStage = normalizeTicketWorkflowStage(
      updates.workflowStage !== undefined
        ? String(updates.workflowStage)
        : current.workflowStage
    )
    const mergedTicket: TicketAlertSnapshot = {
      createdAt: current.createdAt as TicketAlertSnapshot['createdAt'],
      updatedAt: (updated.updatedAt ?? current.updatedAt) as TicketAlertSnapshot['updatedAt'],
      workflowStage: nextWorkflowStage,
      status: nextStatus || (updated.status as string | undefined) || (current.status as string | undefined),
      assignedToIds:
        body.assignedToIds !== undefined
          ? body.assignedToIds
          : (current.assignedToIds as string[] | undefined),
      plannedStart:
        body.plannedStart !== undefined
          ? body.plannedStart
          : (current.plannedStart as TicketAlertSnapshot['plannedStart']),
      plannedEnd:
        body.plannedEnd !== undefined
          ? body.plannedEnd
          : (current.plannedEnd as TicketAlertSnapshot['plannedEnd']),
      externalized: Boolean(updated.externalized ?? current.externalized),
      externalStatus:
        (updated.externalStatus ?? current.externalStatus) as TicketAlertSnapshot['externalStatus'],
      externalSentAt:
        (updated.externalSentAt ?? current.externalSentAt) as TicketAlertSnapshot['externalSentAt'],
      externalizationHistory: (updated.externalizationHistory ??
        current.externalizationHistory) as TicketAlertSnapshot['externalizationHistory'],
      statusHistory: (updated.statusHistory ?? current.statusHistory) as TicketAlertSnapshot['statusHistory'],
    }

    await onMaintenanceTicketUpdated(id, mergedTicket)

    if (
      nextWorkflowStage === 'resolved_admin' &&
      previousWorkflowStage !== 'resolved_admin'
    ) {
      const ticketCode = current.ticketCode || current.incidentNumber || null
      const effectiveMachine =
        body.machine !== undefined ? String(body.machine).trim() : (current.machine || '')
      const effectiveLocation =
        body.location !== undefined ? String(body.location).trim() : (current.location || '')
      const effectiveDescription =
        body.description !== undefined
          ? String(body.description).trim()
          : (current.description || '')

      await notifyTicketResolvedForCreator({
        uid: current.createdById || null,
        payload: {
          type: 'maintenance_ticket_resolved',
          title: 'Ticket resolt',
          body: buildTicketBody({
            machine: effectiveMachine,
            location: effectiveLocation,
            description: effectiveDescription,
          }),
          ticketId: id,
          ticketCode,
          status: 'resolut',
          priority: updates.priority ? String(updates.priority) : current.priority || null,
          location: effectiveLocation,
          machine: effectiveMachine,
          source: current.source || null,
          workflowStage: 'resolved_admin',
        },
        excludeIds: [user.id],
      })
    }

    if (
      nextWorkflowStage === 'planner_queue' &&
      previousWorkflowStage !== 'planner_queue'
    ) {
      const ticketCode = current.ticketCode || current.incidentNumber || null
      const effectiveMachine =
        body.machine !== undefined ? String(body.machine).trim() : (current.machine || '')
      const effectiveLocation =
        body.location !== undefined ? String(body.location).trim() : (current.location || '')
      const effectiveDescription =
        body.description !== undefined
          ? String(body.description).trim()
          : (current.description || '')

      await notifyTicketEnteredPlanner({
        payload: {
          type: 'maintenance_ticket_new',
          title: 'Ticket al planificador',
          body: buildTicketBody({
            machine: effectiveMachine,
            location: effectiveLocation,
            description: effectiveDescription,
          }),
          ticketId: id,
          ticketCode,
          status: mergedTicket.status ? String(mergedTicket.status) : current.status || null,
          priority: updates.priority ? String(updates.priority) : current.priority || null,
          location: effectiveLocation,
          machine: effectiveMachine,
          source: current.source || null,
        },
        excludeIds: [user.id],
      })
    }

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
      const operatorNames =
        body.assignedToNames !== undefined
          ? body.assignedToNames
          : Array.isArray(current.assignedToNames)
            ? current.assignedToNames
            : []
      const plannedStart =
        body.plannedStart !== undefined ? body.plannedStart : (current.plannedStart ?? null)
      const assignPayload = {
        type: 'maintenance_ticket_assigned' as const,
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
      }

      await notifyMaintenanceAssignees({
        uids: body.assignedToIds,
        payload: assignPayload,
        excludeIds: [user.id],
      })

      const creatorId = String(current.createdById || '').trim()
      if (creatorId) {
        await notifyTicketCreator({
          uid: creatorId,
          payload: {
            ...assignPayload,
            body: buildAssignedTicketBodyForCreator({
              machine: effectiveMachine,
              location: effectiveLocation,
              description: effectiveDescription,
              operatorNames,
              plannedStart,
            }),
          },
          excludeIds: [user.id, ...body.assignedToIds],
        })
      }
    }

    if (planningTouched && planningChanged) {
      try {
        const effectiveMachine =
          body.machine !== undefined ? String(body.machine).trim() : (current.machine || '')
        const effectiveLocation =
          body.location !== undefined ? String(body.location).trim() : (current.location || '')
        const effectiveDescription =
          body.description !== undefined ? String(body.description).trim() : (current.description || '')
        const syncedAssignedToIds =
          body.assignedToIds !== undefined
            ? body.assignedToIds
            : Array.isArray(updated.assignedToIds)
              ? (updated.assignedToIds as string[])
              : Array.isArray(current.assignedToIds)
                ? current.assignedToIds
                : []
        const syncedAssignedToNames =
          body.assignedToNames !== undefined
            ? body.assignedToNames
            : Array.isArray(updated.assignedToNames)
              ? (updated.assignedToNames as string[])
              : Array.isArray(current.assignedToNames)
                ? current.assignedToNames
                : []

        const outlookCalendarEvents = await syncMaintenanceTicketOutlookCalendar({
          ticketId: id,
          ticketCode: String(current.ticketCode || current.incidentNumber || '').trim() || id,
          location: effectiveLocation,
          machine: effectiveMachine,
          description: effectiveDescription,
          createdById: String(current.createdById || '').trim() || null,
          assignedToIds: syncedAssignedToIds,
          assignedToNames: syncedAssignedToNames,
          plannedStart: nextPlannedStart,
          plannedEnd: nextPlannedEnd,
          existingEvents: current.outlookCalendarEvents,
          clearPlanning: previousHadPlanning && !nextHasPlanning,
        })

        await ref.set({ outlookCalendarEvents }, { merge: true })
      } catch (err) {
        console.error('[maintenance/tickets] outlook calendar sync error', err)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireMaintenanceTicketApiView()
  if (!auth.ok) return auth.res

  const user = auth.user as SessionUser
  const { id } = await ctx.params

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = snap.data() as MaintenanceTicketRecord
    const canDeleteAsManager = await canDeleteMaintenanceTickets(user)

    if (!canDeleteAsManager && !canUserDeleteMaintenanceTicket(data, user.id)) {
      const isCreator = String(data.createdById || '').trim() === String(user.id || '').trim()
      if (!isCreator) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.json(
        { error: 'No es pot eliminar un ticket resolt o ja planificat' },
        { status: 400 }
      )
    }

    await ref.delete()
    await clearStaleMaintenanceTicketNotifications(id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
