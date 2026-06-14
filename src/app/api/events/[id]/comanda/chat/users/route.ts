import { NextResponse } from 'next/server'
import { hasEventsComandaPreparerOnlyAccess } from '@/lib/eventComanda/permissionsAccess.server'
import { eventComandaAccessUserFromSession } from '@/lib/eventComanda/eventComandaApiAuth'
import { listWarehouseIdsForUser } from '@/lib/eventComanda/warehouseMembers.server'
import {
  canAccessEventComandaChat,
  canManageEventComandaChatMembers,
  findBatchForComandaChat,
  resolveEventComandaBatchChannelId,
  searchEventComandaChatUsers,
} from '@/lib/messaging/comandaChat.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'

export const dynamic = 'force-dynamic'

export async function GET(
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
  const warehouseId = warehouseDocId(searchParams.get('warehouseId') || '')
  const batchId = String(searchParams.get('batchId') || '').trim()
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

  const batch = findBatchForComandaChat(access.order, warehouseId, batchId || null)
  if (!batch) {
    return NextResponse.json({ error: 'Lot de comanda no trobat.' }, { status: 404 })
  }

  const channelId = resolveEventComandaBatchChannelId(eventId, batch)

  const canManage = await canManageEventComandaChatMembers({
    order: access.order,
    userId: auth.user.id,
    role: normalizeRole(auth.user.role),
    channelId,
  })

  if (!canManage) {
    return NextResponse.json({ error: 'Sense permís.' }, { status: 403 })
  }

  const q = String(searchParams.get('q') || '').trim()
  const users = await searchEventComandaChatUsers(q)

  return NextResponse.json({ users })
}
