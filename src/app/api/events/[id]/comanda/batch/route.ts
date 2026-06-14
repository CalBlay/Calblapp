import { NextResponse } from 'next/server'
import { normalizeEventComandaBatchStatus } from '@/lib/eventComanda/batchStatus'
import { getEventComandaTemplate } from '@/lib/eventComanda/template.server'
import { getEventComandaOrder, orderToComandaStatus, deleteEventComandaBatch, updateEventComandaBatch } from '@/lib/eventComanda/order.server'
import { hasEventComandaCreateAccess, hasEventComandaPrepareAccess } from '@/lib/eventComanda/permissionsAccess.server'
import {
  canViewAllEventComandaWarehouses,
  listWarehouseIdsForUser,
} from '@/lib/eventComanda/warehouseMembers.server'
import type { EventComandaBatchStatus } from '@/lib/eventComanda/types'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const BATCH_STATUSES = new Set<EventComandaBatchStatus>([
  'pending',
  'in_progress',
  'ready',
  'sent',
  'issue',
  'cancelled',
])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const canPrepare = await hasEventComandaPrepareAccess({
    id: auth.user.id,
    role: auth.user.role,
    department: auth.user.department,
    canRespondSurveys: Boolean(auth.user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(auth.user.isDepartmentRobaLead),
    robaLinkedPersonnelId: auth.user.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof auth.user.opsProjectsConfigurable === 'boolean'
        ? auth.user.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(auth.user.isTransportLead),
  })
  if (!canPrepare) {
    return NextResponse.json({ error: 'Sense permís per preparar comandes.' }, { status: 403 })
  }

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const body = (await req.json()) as {
    warehouseId?: string
    batchId?: string
    status?: string
    lines?: Array<{ articleCode?: string; qtyPrepared?: number | string | null }>
  }

  const warehouseId = warehouseDocId(body.warehouseId || '')
  const batchId = String(body.batchId || warehouseId).trim()
  if (!warehouseId) {
    return NextResponse.json({ error: 'Cal el magatzem.' }, { status: 400 })
  }

  const role = normalizeRole(auth.user.role)
  if (!canViewAllEventComandaWarehouses(role)) {
    const assignedWarehouseIds = await listWarehouseIdsForUser(auth.user.id)
    const allowed = new Set(assignedWarehouseIds.map((wid) => warehouseDocId(wid)))
    if (!allowed.has(warehouseId)) {
      return NextResponse.json({ error: 'Magatzem no assignat.' }, { status: 403 })
    }
  }

  const order = await getEventComandaOrder(eventId)
  if (!order?.sentAt) {
    return NextResponse.json({ error: 'Comanda no trobada.' }, { status: 404 })
  }

  const statusRaw = String(body.status || '').trim()
  const status = statusRaw
    ? normalizeEventComandaBatchStatus(statusRaw)
    : undefined
  if (statusRaw && !BATCH_STATUSES.has(status!)) {
    return NextResponse.json({ error: 'Estat no vàlid.' }, { status: 400 })
  }

  const lines = Array.isArray(body.lines)
    ? body.lines
        .map((line) => ({
          articleCode: String(line.articleCode || '').trim().toUpperCase(),
          qtyPrepared:
            line.qtyPrepared == null || line.qtyPrepared === ''
              ? null
              : Number(line.qtyPrepared),
        }))
        .filter((line) => line.articleCode)
    : undefined

  if (!status && !lines?.length) {
    return NextResponse.json({ error: 'Cal indicar estat o quantitats preparades.' }, { status: 400 })
  }

  const userId = String(auth.user?.id || '').trim()
  const userName = String(auth.user?.name || '').trim()

  try {
    const updated = await updateEventComandaBatch({
      eventId,
      warehouseId,
      batchId,
      status,
      lines,
      userId,
      userName,
    })
    const template = await getEventComandaTemplate(eventId)
    const hasTemplate = Boolean(template?.lineCount)
    return NextResponse.json({
      ok: true,
      orderStatus: orderToComandaStatus(updated, hasTemplate),
      batch: updated.batches.find(
        (batch) => String(batch.batchId || batch.warehouseId).trim() === batchId
      ),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No s\'ha pogut desar la preparació.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const canCreate = await hasEventComandaCreateAccess({
    id: auth.user.id,
    role: auth.user.role,
    department: auth.user.department,
    canRespondSurveys: Boolean(auth.user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(auth.user.isDepartmentRobaLead),
    robaLinkedPersonnelId: auth.user.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof auth.user.opsProjectsConfigurable === 'boolean'
        ? auth.user.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(auth.user.isTransportLead),
  })
  if (!canCreate) {
    return NextResponse.json({ error: 'Sense permís per eliminar comandes.' }, { status: 403 })
  }

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const body = (await req.json()) as {
    warehouseId?: string
    batchId?: string
  }

  const warehouseId = warehouseDocId(body.warehouseId || '')
  const batchId = String(body.batchId || warehouseId).trim()
  if (!warehouseId) {
    return NextResponse.json({ error: 'Cal el magatzem.' }, { status: 400 })
  }

  const userId = String(auth.user?.id || '').trim()
  const userName = String(auth.user?.name || '').trim()

  try {
    const updated = await deleteEventComandaBatch({
      eventId,
      warehouseId,
      batchId,
      userId,
      userName,
    })
    const template = await getEventComandaTemplate(eventId)
    const hasTemplate = Boolean(template?.lineCount)
    return NextResponse.json({
      ok: true,
      orderStatus: orderToComandaStatus(updated, hasTemplate),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No s\'ha pogut eliminar la comanda.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
