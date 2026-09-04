import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  canDeleteMaintenanceTickets,
  canManageAllMaintenanceTickets,
  canManageMaintenanceTicketInbox,
  canReopenMaintenanceTickets,
  canValidateMaintenanceTickets,
  canViewQualitatCuinaCentralMaintenanceTickets,
  canUseDecoTicketPermission,
} from '@/lib/server/maintenanceTicketsAccess'
import { clearStaleMaintenanceTicketNotifications } from '@/lib/maintenanceNotifications'
import { requireMaintenanceTicketApiView } from '@/lib/server/maintenanceApiAuth'
import {
  buildAssignedTicketBodyForCreator,
  buildTicketBody,
  notifyMaintenanceAssignees,
  notifyForNewDecoTicket,
  notifyTicketCreator,
  notifyTicketEnteredPlanner,
  notifyTicketPendingCapValidation,
  notifyTicketResolvedForCreator,
  onMaintenanceTicketUpdated,
} from '@/lib/maintenanceNotifications'
import { canActorMutateMaintenanceTicket } from '@/lib/maintenanceTicketPatchAuth'
import {
  canCreatorValidateMaintenanceTicket,
  maintenanceTicketRequiresCreatorValidation,
} from '@/lib/maintenanceTicketValidation'
import {
  getCuinaCentralUserIds,
  isQualitatVisibleCuinaCentralTicket,
} from '@/lib/server/qualitatCuinaCentralTickets'
import {
  normalizeTicketWorkflowStage,
  type TicketAlertSnapshot,
} from '@/lib/maintenanceTicketAlerts'
import {
  applyStatusHistoryUpdate,
  getOpenSegmentStart,
  validateJourneyStatusPayload,
  type JourneyStatus,
  type StatusHistoryEntry,
} from '@/lib/maintenanceJourneyStatus'
import {
  applyWorkLogUpdate,
  closeOpenWorkLogsForDirectResolution,
  shouldCloseOpenWorkLogsForNonWorkerStatusExit,
  type MaintenanceWorkLogEntry,
} from '@/lib/maintenanceWorkLogs'
import {
  normalizeAssignedIds,
  rangesOverlap,
  shouldCheckMaintenanceAssigneeConflict,
} from '@/lib/maintenanceAssigneeConflict'
import {
  syncMaintenanceTicketOutlookCalendar,
  type MaintenanceTicketOutlookEventRef,
} from '@/lib/maintenanceTicketOutlook'
import admin from 'firebase-admin'

export const runtime = 'nodejs'

const REASSIGN_PENDING_NOTE = 'Pendent de reassignar al planificador'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
}

type UpdatePayload = {
  center?: string | null
  status?: 'nou' | 'assignat' | 'reassignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat'
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
  creatorValidationDecision?: 'correct' | 'incorrect'
  creatorValidationNote?: string | null
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
  center?: string | null
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
  workLogs?: MaintenanceWorkLogEntry[]
  imageUrls?: string[] | null
  completionAttachments?: Array<{
    url?: string | null
    path?: string | null
    meta?: { size?: number; type?: string; name?: string } | null
  }> | null
  requiresCreatorValidation?: boolean
  creatorValidatedAt?: number | string | null
  creatorRejectedAt?: number | string | null
  creatorRejectedById?: string | null
  creatorRejectedByName?: string | null
  creatorRejectionNote?: string | null
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
  if (v === 'reassignat') return 'reassignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut') return 'fet'
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

const haveSameAssignedIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((entry) => rightSet.has(entry))
}

async function findMaintenanceTicketAssigneeConflict(params: {
  ticketId: string
  assignedToIds: string[]
  plannedStart: number | null
  plannedEnd: number | null
}) {
  const { ticketId, assignedToIds, plannedStart, plannedEnd } = params
  if (!assignedToIds.length || plannedStart === null || plannedEnd === null) return null

  const dayStart = new Date(plannedStart)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(plannedStart)
  dayEnd.setHours(23, 59, 59, 999)

  const snap = await db
    .collection('maintenanceTickets')
    .where('plannedStart', '>=', dayStart.getTime())
    .where('plannedStart', '<=', dayEnd.getTime())
    .get()

  for (const doc of snap.docs) {
    if (doc.id === ticketId) continue
    const data = doc.data() as MaintenanceTicketRecord
    const otherIds = normalizeAssignedIds(data.assignedToIds)
    if (!otherIds.some((id) => assignedToIds.includes(id))) continue

    const otherStart = toMillis(data.plannedStart)
    const otherEnd = toMillis(data.plannedEnd)
    if (!rangesOverlap(plannedStart, plannedEnd, otherStart, otherEnd)) continue

    const conflictId = otherIds.find((id) => assignedToIds.includes(id)) || ''
    const conflictName = Array.isArray(data.assignedToNames)
      ? String(data.assignedToNames[otherIds.indexOf(conflictId)] || '').trim()
      : ''

    return {
      conflictingTicketId: doc.id,
      conflictingTicketCode: String(data.ticketCode || data.incidentNumber || doc.id).trim(),
      conflictingPersonId: conflictId,
      conflictingPersonName: conflictName,
      conflictingStart: otherStart,
      conflictingEnd: otherEnd,
    }
  }

  return null
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
      String(data.ticketType || 'maquinaria').toLowerCase() === 'deco'
        ? (await canUseDecoTicketPermission(user, 'manage')) ||
          (await canUseDecoTicketPermission(user, 'inbox'))
        : (await canManageAllMaintenanceTickets(user)) || (await canManageMaintenanceTicketInbox(user))
    const canViewQualitatCuinaCentral = canViewQualitatCuinaCentralMaintenanceTickets(user)
    const cuinaCentralUserIds = canViewQualitatCuinaCentral
      ? new Set(await getCuinaCentralUserIds())
      : null

    const assignedIds = Array.isArray(data.assignedToIds) ? data.assignedToIds.map(String) : []
    const assignedNames = Array.isArray(data.assignedToNames)
      ? data.assignedToNames.map((name) => normalizeName(String(name || '')))
      : []
    const sessionName = normalizeName(user.name || '')
    const canViewAssignedTicket =
      assignedIds.includes(String(user.id || '')) ||
      (!!sessionName && assignedNames.includes(sessionName))

    const canViewQualitatTicket =
      canViewQualitatCuinaCentral &&
      cuinaCentralUserIds &&
      isQualitatVisibleCuinaCentralTicket(data, cuinaCentralUserIds, user.id)

    if (
      !canViewAllTickets &&
      data.createdById !== user.id &&
      !canViewAssignedTicket &&
      !canViewQualitatTicket
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
  const auth = await requireMaintenanceTicketApiView()
  if (!auth.ok) return auth.res

  const user = auth.user as SessionUser
  let canManageTickets = await canManageAllMaintenanceTickets(user)
  let canManageInbox = await canManageMaintenanceTicketInbox(user)
  let canValidate = await canValidateMaintenanceTickets(user)
  let canReopen = await canReopenMaintenanceTickets(user)
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
    const isDecoTicket = String(current.ticketType || 'maquinaria').toLowerCase() === 'deco'
    if (isDecoTicket) {
      ;[canManageTickets, canManageInbox, canValidate, canReopen] = await Promise.all([
        canUseDecoTicketPermission(user, 'manage'),
        canUseDecoTicketPermission(user, 'inbox'),
        canUseDecoTicketPermission(user, 'validate'),
        canUseDecoTicketPermission(user, 'reopen'),
      ])
    }
    const previousWorkflowStage = normalizeTicketWorkflowStage(current.workflowStage)

    const creatorValidationDecisionEarly =
      body.creatorValidationDecision === 'correct' || body.creatorValidationDecision === 'incorrect'
        ? body.creatorValidationDecision
        : body.validationApproval === 'creator'
          ? 'correct'
          : null

    // Creator validation is a dedicated early path below; all other mutations
    // require manage/inbox OR being the assigned worker (treballador).
    // View-only actors (e.g. Qualitat Cuina Central) must not mutate.
    if (
      !creatorValidationDecisionEarly &&
      !canActorMutateMaintenanceTicket({
        role,
        userId: user.id,
        assignedToIds: current.assignedToIds,
        canManageTickets,
        canManageInbox,
      })
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (
      role === 'treballador' &&
      !canManageTickets &&
      !canManageInbox &&
      !creatorValidationDecisionEarly
    ) {
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
    const currentAssignedIds = normalizeAssignedIds(current.assignedToIds)
    const nextAssignedIds =
      body.assignedToIds !== undefined ? normalizeAssignedIds(body.assignedToIds) : currentAssignedIds
    const assigneesChanged =
      body.assignedToIds !== undefined && !haveSameAssignedIds(currentAssignedIds, nextAssignedIds)
    const validationApproval =
      body.validationApproval === 'creator' || body.validationApproval === 'cap'
        ? body.validationApproval
        : null
    const creatorValidationDecision =
      body.creatorValidationDecision === 'correct' || body.creatorValidationDecision === 'incorrect'
        ? body.creatorValidationDecision
        : validationApproval === 'creator'
          ? 'correct'
          : null

    if (assigneesChanged && currentAssignedIds.length > 0) {
      const canReassignFromCurrentStatus =
        currentStatus === 'assignat' || currentStatus === 'no_fet' || currentStatus === 'reassignat'
      if (!canReassignFromCurrentStatus) {
        return NextResponse.json(
          { error: "Només es poden reassignar tickets en estat Assignat o No fet." },
          { status: 400 }
        )
      }
    }

    if (creatorValidationDecision) {
      if (!canCreatorValidateMaintenanceTicket(current, user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const now = Date.now()
      const rejectionNote = String(body.creatorValidationNote || '').trim()
      if (creatorValidationDecision === 'incorrect' && !rejectionNote) {
        return NextResponse.json(
          { error: "Cal indicar per què la resolució no és correcta." },
          { status: 400 }
        )
      }
      const ticketCode = current.ticketCode || current.incidentNumber || null
      const notifyBase = {
        ticketId: id,
        ticketCode,
        status: 'fet' as const,
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

      if (creatorValidationDecision === 'correct') {
        const creatorUpdates: Record<string, unknown> = {
          status: 'validat',
          workflowStage: current.externalized ? 'externalized' : 'closed',
          requiresCreatorValidation: false,
          creatorValidatedAt: now,
          creatorValidatedById: user.id,
          creatorValidatedByName: user.name || '',
          resolvedAt: now,
          updatedAt: now,
          updatedById: user.id,
          updatedByName: user.name || '',
          statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: 'validat',
          at: now,
          byId: user.id,
          byName: user.name || '',
          note: 'Validat pel creador',
          }),
        }
        await ref.set(creatorUpdates, { merge: true })
        await notifyTicketPendingCapValidation({
          ticketType: isDecoTicket ? 'deco' : 'maquinaria',
          payload: {
            type: isDecoTicket
              ? 'deco_ticket_validated'
              : 'maintenance_ticket_validated',
            title: 'Resolució validada pel creador',
            ...notifyBase,
            status: 'validat',
            workflowStage: current.externalized ? 'externalized' : 'closed',
          },
          excludeIds: [user.id],
        })
      } else {
        const reopenedStatus = currentAssignedIds.length > 0 ? 'assignat' : 'reassignat'
        const reopenedStage = current.externalized
          ? 'externalized'
          : currentAssignedIds.length > 0
            ? 'planned_internal'
            : 'tickets_inbox'
        const creatorUpdates: Record<string, unknown> = {
          status: reopenedStatus,
          workflowStage: reopenedStage,
          requiresCreatorValidation: false,
          creatorValidatedAt: null,
          creatorValidatedById: null,
          creatorValidatedByName: null,
          creatorRejectedAt: now,
          creatorRejectedById: user.id,
          creatorRejectedByName: user.name || '',
          creatorRejectionNote: rejectionNote,
          capValidatedAt: null,
          capValidatedById: null,
          capValidatedByName: null,
          resolvedAt: null,
          resolvedById: null,
          resolvedByName: null,
          updatedAt: now,
          updatedById: user.id,
          updatedByName: user.name || '',
          statusHistory: admin.firestore.FieldValue.arrayUnion({
            status: reopenedStatus,
            at: now,
            byId: user.id,
            byName: user.name || '',
            note: `Reobert pel creador: ${rejectionNote}`,
          }),
        }
        await ref.set(creatorUpdates, { merge: true })

        const reopenedPayload = {
          type: isDecoTicket
            ? 'deco_ticket_reopened' as const
            : 'maintenance_ticket_reopened' as const,
          title: 'El creador ha reobert el ticket',
          ...notifyBase,
          body: `${notifyBase.body} · Motiu: ${rejectionNote}`,
          status: reopenedStatus,
          workflowStage: reopenedStage,
        }
        const responsibleIds = Array.from(
          new Set([
            ...currentAssignedIds,
            String(current.resolvedById || '').trim(),
          ].filter(Boolean))
        )
        await notifyMaintenanceAssignees({
          uids: responsibleIds,
          payload: reopenedPayload,
          excludeIds: [user.id],
        })
        await notifyTicketPendingCapValidation({
          ticketType: isDecoTicket ? 'deco' : 'maquinaria',
          payload: {
            ...reopenedPayload,
          },
          excludeIds: [user.id, ...responsibleIds],
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
      body.center !== undefined ||
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

    const isReopeningValidatedTicket =
      currentStatus === 'validat' && nextStatus === 'fet'

    if (nextStatus) updates.status = nextStatus
    if (body.workflowStage !== undefined) {
      updates.workflowStage = normalizeWorkflowStage(body.workflowStage)
    }
    if (body.intakeChannel !== undefined) {
      updates.intakeChannel = String(body.intakeChannel || '').trim() || null
    }
    if (nextPriority) updates.priority = nextPriority
    if (body.center !== undefined) updates.center = String(body.center || '').trim() || null
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

    if (isReopeningValidatedTicket) {
      updates.creatorValidatedAt = null
      updates.creatorValidatedById = null
      updates.creatorValidatedByName = null
      updates.capValidatedAt = null
      updates.capValidatedById = null
      updates.capValidatedByName = null
      updates.resolvedAt = null
      updates.resolvedById = null
      updates.resolvedByName = null
      updates.workflowStage = current.externalized
        ? 'externalized'
        : Array.isArray(current.assignedToIds) && current.assignedToIds.length > 0
          ? 'planned_internal'
          : 'planner_queue'
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
    // Planning saves from the planner always include plannedStart/assignedToIds.
    // Never auto-force status back to `assignat` for `en_curs` / `espera`:
    // that leaves open workLogs without endTime, and computeWorkLogMinutes
    // ignores open entries — permanently dropping already-worked time.
    // Clients that need assignat (no_fet / reassignat) send status explicitly.

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

    if (
      shouldCheckMaintenanceAssigneeConflict({
        planningTouched,
        planningChanged,
        assignedToIds: nextAssignedIds,
        plannedStart: nextPlannedStart,
        plannedEnd: nextPlannedEnd,
      })
    ) {
      const overlapConflict = await findMaintenanceTicketAssigneeConflict({
        ticketId: id,
        assignedToIds: nextAssignedIds,
        plannedStart: nextPlannedStart,
        plannedEnd: nextPlannedEnd,
      })
      if (overlapConflict) {
        const who =
          overlapConflict.conflictingPersonName ||
          overlapConflict.conflictingPersonId ||
          'Operari'
        return NextResponse.json(
          {
            error: `${who} ja te un altre ticket assignat en aquesta mateixa franja (${overlapConflict.conflictingTicketCode}).`,
          },
          { status: 409 }
        )
      }
    }

    let autoReturnToPlanner = false

    if (body.assignedToIds !== undefined) {
      updates.assignedAt = nextAssignedIds.length ? Date.now() : null
      updates.assignedById = user.id
      updates.assignedByName = user.name || ''
      if (nextAssignedIds.length > 0) {
        updates.workflowStage = 'planned_internal'
      } else if (normalizeWorkflowStage(String(current.workflowStage || '')) === 'planned_internal') {
        updates.workflowStage = 'planner_queue'
      }
      if (
        !nextStatus &&
        nextAssignedIds.length > 0 &&
        (currentStatus === 'nou' ||
          currentStatus === 'no_fet' ||
          currentStatus === 'reassignat')
      ) {
        nextStatus = 'assignat'
        updates.status = nextStatus
      }
    }

    if (wantsCapValidation) {
      if (!canValidate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const requiresCreatorValidation = maintenanceTicketRequiresCreatorValidation(current)
      if (requiresCreatorValidation) {
        return NextResponse.json(
          { error: 'Aquest ticket està pendent de validació del creador.' },
          { status: 400 }
        )
      }
      if (currentStatus !== 'fet' && !requiresCreatorValidation) {
        return NextResponse.json({ error: 'Nomes es pot validar des de Fet' }, { status: 400 })
      }

      const now = Date.now()
      updates.capValidatedAt = now
      updates.capValidatedById = user.id
      updates.capValidatedByName = user.name || ''

      const creatorAlreadyValidated = Boolean(current.creatorValidatedAt)
      if (requiresCreatorValidation && !creatorAlreadyValidated) {
        nextStatus = 'fet'
        updates.status = 'fet'
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

    if (role === 'treballador' && !canManageTickets && !canManageInbox && nextStatus) {
      if (current.externalized && nextStatus === 'fet') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const allowed: Record<string, string[]> = {
        assignat: ['en_curs', 'espera'],
        en_curs: ['espera', 'fet', 'no_fet'],
        espera: ['en_curs', 'fet', 'no_fet'],
      }
      const nextAllowed = allowed[currentStatus] || []
      const sameStatusContinuation =
        nextStatus === currentStatus && (currentStatus === 'en_curs' || currentStatus === 'espera')
      if (!sameStatusContinuation && !nextAllowed.includes(nextStatus)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (nextStatus) {
      if (role === 'treballador' && !canManageTickets && !canManageInbox) {
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

      if (role === 'treballador' && !canManageTickets && !canManageInbox && nextStatus === 'no_fet') {
        autoReturnToPlanner = true
        const autoReassignNote = String(body.statusNote || '').trim()
        const historyWithReassign = Array.isArray(updates.statusHistory)
          ? [...updates.statusHistory]
          : []
        historyWithReassign.push({
          status: 'reassignat',
          at: Date.now(),
          byId: user.id,
          byName: user.name || '',
          note: autoReassignNote
            ? `${REASSIGN_PENDING_NOTE}: ${autoReassignNote}`
            : REASSIGN_PENDING_NOTE,
          startTime: null,
          endTime: null,
        })
        updates.statusHistory = historyWithReassign
        updates.status = 'reassignat'
        nextStatus = 'reassignat'
        updates.workflowStage = 'planner_queue'
        updates.plannedStart = null
        updates.plannedEnd = null
        updates.assignedToIds = []
        updates.assignedToNames = []
        updates.assignedAt = null
        updates.assignedById = null
        updates.assignedByName = null
        updates.planningHistory = admin.firestore.FieldValue.arrayUnion({
          action: 'desplanificat',
          at: Date.now(),
          byId: user.id,
          byName: user.name || '',
          plannedStart: null,
          plannedEnd: null,
          previousPlannedStart,
          previousPlannedEnd,
          assignedToNames: Array.isArray(current.assignedToNames) ? current.assignedToNames : [],
          note: autoReassignNote
            ? `No fet. ${REASSIGN_PENDING_NOTE.toLowerCase()}: ${autoReassignNote}`
            : `No fet. ${REASSIGN_PENDING_NOTE.toLowerCase()}`,
        })
      }

      if (role === 'treballador' && !canManageTickets && !canManageInbox) {
        const workLogs = Array.isArray(current.workLogs)
          ? (current.workLogs as MaintenanceWorkLogEntry[])
          : []
        const fallbackOpenStartTime =
          currentStatus === 'en_curs' ? getOpenSegmentStart(history, 'en_curs') : ''
        updates.workLogs = applyWorkLogUpdate(
          workLogs,
          currentStatus as JourneyStatus,
          nextStatus as JourneyStatus,
          {
            at: Date.now(),
            closeSegmentEndTime: closeEnd,
            newSegmentStartTime: newStart,
            fallbackOpenStartTime,
            note: body.statusNote ?? null,
            userId: user.id,
            userName: user.name || '',
          }
        )
      }

      if (Array.isArray(body.completionImages) && body.completionImages.length > 0) {
        const { newAttachments, merged } = buildMergedCompletionAttachments()
        if (
          nextStatus === 'fet' &&
          role === 'treballador' &&
          !canManageTickets &&
          !canManageInbox &&
          newAttachments.length < 1
        ) {
          return NextResponse.json(
            { error: "Cal adjuntar com a minim una foto o fitxer nou de l'operari per marcar Fet." },
            { status: 400 }
          )
        }
        updates.completionAttachments = merged
      } else if (nextStatus === 'fet' && role === 'treballador' && !canManageTickets && !canManageInbox) {
        return NextResponse.json(
          { error: "Cal adjuntar com a minim una foto o fitxer nou de l'operari per marcar Fet." },
          { status: 400 }
        )
      }
    }

    if (
      updates.workflowStage === 'resolved_admin' ||
      updates.workflowStage === 'resolved_planner'
    ) {
      const resolvedAt = Date.now()
      updates.resolvedAt = resolvedAt
      updates.resolvedById = user.id
      updates.resolvedByName = user.name || ''
      updates.status = 'fet'
      nextStatus = 'fet'
      updates.creatorValidatedAt = null
      updates.creatorValidatedById = null
      updates.creatorValidatedByName = null
      updates.capValidatedAt = null
      updates.capValidatedById = null
      updates.capValidatedByName = null
      updates.requiresCreatorValidation = false
      if (
        Array.isArray(body.completionImages) &&
        body.completionImages.length > 0 &&
        updates.completionAttachments === undefined
      ) {
        updates.completionAttachments = buildMergedCompletionAttachments().merged
      }
      // Direct Resoldre never goes through the treballador journey that
      // calls applyWorkLogUpdate, so open en_curs segments would stay
      // endTime:null and computeWorkLogMinutes would drop those minutes.
      const existingWorkLogs = Array.isArray(updates.workLogs)
        ? (updates.workLogs as MaintenanceWorkLogEntry[])
        : Array.isArray(current.workLogs)
          ? (current.workLogs as MaintenanceWorkLogEntry[])
          : []
      updates.workLogs = closeOpenWorkLogsForDirectResolution(existingWorkLogs, {
        at: resolvedAt,
        endTime: body.statusEndTime ?? null,
        note: body.statusNote ?? body.resolutionNote ?? null,
      })
      updates.statusHistory = admin.firestore.FieldValue.arrayUnion({
        status: 'fet',
        at: resolvedAt,
        byId: user.id,
        byName: user.name || '',
        startTime: body.statusStartTime ?? null,
        endTime: body.statusEndTime ?? null,
        note: body.statusNote ?? body.resolutionNote ?? '',
      })
    }

    const becameDone = nextStatus === 'fet' && currentStatus !== 'fet'
    if (becameDone) {
      updates.requiresCreatorValidation = false
      updates.creatorValidatedAt = null
      updates.creatorValidatedById = null
      updates.creatorValidatedByName = null
      updates.creatorRejectedAt = null
      updates.creatorRejectedById = null
      updates.creatorRejectedByName = null
      updates.creatorRejectionNote = null
      updates.capValidatedAt = null
      updates.capValidatedById = null
      updates.capValidatedByName = null
    }

    // Manager/cap Fulls journey (and similar non-worker status paths) skip
    // applyWorkLogUpdate. Leaving en_curs without closing open segments
    // permanently drops those minutes from computeWorkLogMinutes.
    if (
      shouldCloseOpenWorkLogsForNonWorkerStatusExit({
        currentStatus,
        nextStatus,
        workLogsAlreadyUpdated: updates.workLogs !== undefined,
      })
    ) {
      const existingWorkLogs = Array.isArray(current.workLogs)
        ? (current.workLogs as MaintenanceWorkLogEntry[])
        : []
      updates.workLogs = closeOpenWorkLogsForDirectResolution(existingWorkLogs, {
        at: Date.now(),
        endTime: body.statusEndTime ?? null,
        note: body.statusNote ?? null,
        closedByStatus: nextStatus,
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
    const mergedAssignedToIds =
      body.assignedToIds !== undefined
        ? body.assignedToIds
        : updates.assignedToIds !== undefined
          ? (updates.assignedToIds as string[] | undefined)
          : Array.isArray(updated.assignedToIds)
            ? (updated.assignedToIds as string[])
            : (current.assignedToIds as string[] | undefined)
    const mergedPlannedStart =
      body.plannedStart !== undefined
        ? body.plannedStart
        : updates.plannedStart !== undefined
          ? (updates.plannedStart as TicketAlertSnapshot['plannedStart'])
          : (updated.plannedStart ?? current.plannedStart) as TicketAlertSnapshot['plannedStart']
    const mergedPlannedEnd =
      body.plannedEnd !== undefined
        ? body.plannedEnd
        : updates.plannedEnd !== undefined
          ? (updates.plannedEnd as TicketAlertSnapshot['plannedEnd'])
          : (updated.plannedEnd ?? current.plannedEnd) as TicketAlertSnapshot['plannedEnd']

    const mergedTicket: TicketAlertSnapshot = {
      createdAt: current.createdAt as TicketAlertSnapshot['createdAt'],
      updatedAt: (updated.updatedAt ?? current.updatedAt) as TicketAlertSnapshot['updatedAt'],
      workflowStage: nextWorkflowStage,
      status: nextStatus || (updated.status as string | undefined) || (current.status as string | undefined),
      assignedToIds: mergedAssignedToIds,
      plannedStart: mergedPlannedStart,
      plannedEnd: mergedPlannedEnd,
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

    if (becameDone) {
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
          type: isDecoTicket ? 'deco_ticket_resolved' : 'maintenance_ticket_resolved',
          title: 'Ticket marcat com a fet',
          body: buildTicketBody({
            machine: effectiveMachine,
            location: effectiveLocation,
            description: effectiveDescription,
          }),
          ticketId: id,
          ticketCode,
          status: 'fet',
          priority: updates.priority ? String(updates.priority) : current.priority || null,
          location: effectiveLocation,
          machine: effectiveMachine,
          source: current.source || null,
          workflowStage: nextWorkflowStage,
        },
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

      const plannerNotification = {
          type: isDecoTicket ? 'deco_ticket_new' : 'maintenance_ticket_new',
          title: isDecoTicket ? 'Ticket al planificador Deco' : 'Ticket al planificador',
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
          workflowStage: 'planner_queue',
        } as const
      if (isDecoTicket) {
        await notifyForNewDecoTicket({ payload: plannerNotification, excludeIds: [user.id] })
      } else {
        await notifyTicketEnteredPlanner({
          payload: plannerNotification,
          excludeIds: [user.id],
        })
      }
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
          type: isDecoTicket ? 'deco_ticket_validated' : 'maintenance_ticket_validated',
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
        type: isDecoTicket ? 'deco_ticket_assigned' as const : 'maintenance_ticket_assigned' as const,
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

    if ((planningTouched && planningChanged) || autoReturnToPlanner) {
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
            : updates.assignedToIds !== undefined
              ? (updates.assignedToIds as string[])
            : Array.isArray(updated.assignedToIds)
              ? (updated.assignedToIds as string[])
              : Array.isArray(current.assignedToIds)
                ? current.assignedToIds
                : []
        const syncedAssignedToNames =
          body.assignedToNames !== undefined
            ? body.assignedToNames
            : updates.assignedToNames !== undefined
              ? (updates.assignedToNames as string[])
            : Array.isArray(updated.assignedToNames)
              ? (updated.assignedToNames as string[])
              : Array.isArray(current.assignedToNames)
                ? current.assignedToNames
                : []
        const syncedPlannedStart = autoReturnToPlanner ? null : nextPlannedStart
        const syncedPlannedEnd = autoReturnToPlanner ? null : nextPlannedEnd

        const outlookCalendarEvents = await syncMaintenanceTicketOutlookCalendar({
          ticketId: id,
          ticketCode: String(current.ticketCode || current.incidentNumber || '').trim() || id,
          location: effectiveLocation,
          machine: effectiveMachine,
          description: effectiveDescription,
          createdById: String(current.createdById || '').trim() || null,
          assignedToIds: syncedAssignedToIds,
          assignedToNames: syncedAssignedToNames,
          plannedStart: syncedPlannedStart,
          plannedEnd: syncedPlannedEnd,
          existingEvents: current.outlookCalendarEvents,
          clearPlanning: autoReturnToPlanner || (previousHadPlanning && !nextHasPlanning),
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

    const canDeleteAsManager =
      String(data.ticketType || 'maquinaria').toLowerCase() === 'deco'
        ? await canUseDecoTicketPermission(user, 'delete')
        : await canDeleteMaintenanceTickets(user)

    if (!canDeleteAsManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const outlookCalendarEvents = data.outlookCalendarEvents || {}
    if (Object.keys(outlookCalendarEvents).length > 0) {
      const remainingCalendarEvents = await syncMaintenanceTicketOutlookCalendar({
        ticketId: id,
        existingEvents: outlookCalendarEvents,
        clearPlanning: true,
      })
      if (Object.keys(remainingCalendarEvents).length > 0) {
        return NextResponse.json(
          { error: 'No s han pogut eliminar tots els esdeveniments Outlook del ticket' },
          { status: 502 }
        )
      }
    }

    await ref.delete()
    await clearStaleMaintenanceTicketNotifications(id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
