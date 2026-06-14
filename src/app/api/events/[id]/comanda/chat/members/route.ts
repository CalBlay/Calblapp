import { NextResponse } from 'next/server'
import { hasEventsComandaPreparerOnlyAccess } from '@/lib/eventComanda/permissionsAccess.server'
import { eventComandaAccessUserFromSession } from '@/lib/eventComanda/eventComandaApiAuth'
import { listWarehouseIdsForUser } from '@/lib/eventComanda/warehouseMembers.server'
import {
  addEventComandaChatMember,
  canAccessEventComandaChat,
  canManageEventComandaChatMembers,
  eventComandaBatchIdentity,
  findBatchForComandaChat,
  removeEventComandaChatMember,
  resolveEventComandaBatchChannelId,
} from '@/lib/messaging/comandaChat.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'

export const dynamic = 'force-dynamic'

function resolveBatchContext(
  eventId: string,
  order: NonNullable<Awaited<ReturnType<typeof canAccessEventComandaChat>>['order']>,
  warehouseId: string,
  batchId: string
) {
  const batch = findBatchForComandaChat(order, warehouseId, batchId || null)
  if (!batch) return null
  return {
    batch,
    batchKey: eventComandaBatchIdentity(batch),
    channelId: resolveEventComandaBatchChannelId(eventId, batch),
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const body = (await req.json()) as {
    userId?: string
    warehouseId?: string
    batchId?: string
  }
  const targetUserId = String(body.userId || '').trim()
  const warehouseId = warehouseDocId(body.warehouseId || '')
  const batchId = String(body.batchId || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'Cal seleccionar un usuari.' }, { status: 400 })
  }
  if (!warehouseId) {
    return NextResponse.json({ error: 'Magatzem no vàlid.' }, { status: 400 })
  }

  const accessUser = eventComandaAccessUserFromSession(auth.user)
  const preparerOnly = await hasEventsComandaPreparerOnlyAccess(accessUser)
  const assignedWarehouseIds = await listWarehouseIdsForUser(auth.user.id)

  const access = await canAccessEventComandaChat({
    eventId,
    userId: auth.user.id,
    role: normalizeRole(auth.user.role),
    preparerOnly,
    assignedWarehouseIds,
    warehouseId,
    batchId: batchId || null,
  })

  if (!access.ok || !access.order) {
    return NextResponse.json({ error: 'Comanda no disponible.' }, { status: 403 })
  }

  const context = resolveBatchContext(eventId, access.order, warehouseId, batchId)
  if (!context) {
    return NextResponse.json({ error: 'Lot de comanda no trobat.' }, { status: 404 })
  }

  const canManage = await canManageEventComandaChatMembers({
    order: access.order,
    userId: auth.user.id,
    role: normalizeRole(auth.user.role),
    channelId: context.channelId,
  })

  if (!canManage) {
    return NextResponse.json({ error: 'Sense permís per afegir participants.' }, { status: 403 })
  }

  try {
    const result = await addEventComandaChatMember({
      eventId,
      warehouseId,
      batchId: context.batchKey,
      targetUserId,
      actorUserId: auth.user.id,
      actorRole: normalizeRole(auth.user.role),
    })

    return NextResponse.json({
      ok: true,
      channelId: result.channelId,
      warehouseId: result.warehouseId,
      batchId: result.batchId,
      memberCount: result.memberCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No s\'ha pogut afegir el participant.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const targetUserId = String(searchParams.get('userId') || '').trim()
  const warehouseId = warehouseDocId(searchParams.get('warehouseId') || '')
  const batchId = String(searchParams.get('batchId') || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'Cal seleccionar un usuari.' }, { status: 400 })
  }
  if (!warehouseId) {
    return NextResponse.json({ error: 'Magatzem no vàlid.' }, { status: 400 })
  }

  const accessUser = eventComandaAccessUserFromSession(auth.user)
  const preparerOnly = await hasEventsComandaPreparerOnlyAccess(accessUser)
  const assignedWarehouseIds = await listWarehouseIdsForUser(auth.user.id)

  const access = await canAccessEventComandaChat({
    eventId,
    userId: auth.user.id,
    role: normalizeRole(auth.user.role),
    preparerOnly,
    assignedWarehouseIds,
    warehouseId,
    batchId: batchId || null,
  })

  if (!access.ok || !access.order) {
    return NextResponse.json({ error: 'Comanda no disponible.' }, { status: 403 })
  }

  const context = resolveBatchContext(eventId, access.order, warehouseId, batchId)
  if (!context) {
    return NextResponse.json({ error: 'Lot de comanda no trobat.' }, { status: 404 })
  }

  try {
    const result = await removeEventComandaChatMember({
      eventId,
      warehouseId,
      batchId: context.batchKey,
      targetUserId,
      actorUserId: auth.user.id,
      actorRole: normalizeRole(auth.user.role),
    })

    return NextResponse.json({
      ok: true,
      channelId: result.channelId,
      warehouseId: result.warehouseId,
      batchId: result.batchId,
      memberCount: result.memberCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No s\'ha pogut treure el participant.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
