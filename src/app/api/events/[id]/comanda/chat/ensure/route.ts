import { NextResponse } from 'next/server'
import { hasEventsComandaPreparerOnlyAccess } from '@/lib/eventComanda/permissionsAccess.server'
import { isComandaWarehouseChatActive } from '@/lib/eventComanda/batchStatus'
import { listWarehouseIdsForUser } from '@/lib/eventComanda/warehouseMembers.server'
import {
  archiveEventComandaBatchChatChannel,
  canAccessEventComandaChat,
  canManageEventComandaChatMembers,
  eventComandaBatchIdentity,
  findBatchForComandaChat,
  syncEventComandaBatchChatChannel,
} from '@/lib/messaging/comandaChat.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'

export const dynamic = 'force-dynamic'

function accessUserFromSession(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean
  isTransportLead?: boolean
}) {
  return {
    id: user.id,
    role: user.role,
    department: user.department,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof user.opsProjectsConfigurable === 'boolean'
        ? user.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(user.isTransportLead),
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

  const body = (await req.json()) as { warehouseId?: string; batchId?: string }
  const warehouseId = warehouseDocId(body.warehouseId || '')
  const batchId = String(body.batchId || '').trim()
  if (!warehouseId) {
    return NextResponse.json({ error: 'Magatzem no vàlid.' }, { status: 400 })
  }

  const accessUser = accessUserFromSession(auth.user)
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

  try {
    const batch = findBatchForComandaChat(access.order, warehouseId, batchId || null)
    if (!batch) {
      return NextResponse.json({ error: 'Lot de comanda no trobat.' }, { status: 404 })
    }
    const batchKey = eventComandaBatchIdentity(batch)
    const chatActive = isComandaWarehouseChatActive(batch.status)

    const result = chatActive
      ? await syncEventComandaBatchChatChannel(eventId, warehouseId, batchKey)
      : await archiveEventComandaBatchChatChannel(eventId, warehouseId, batchKey)

    if (!result?.channelId) {
      return NextResponse.json({ error: 'No s\'ha pogut obrir el xat.' }, { status: 400 })
    }

    const canManageChatMembers = chatActive
      ? await canManageEventComandaChatMembers({
          order: access.order,
          userId: auth.user.id,
          role: normalizeRole(auth.user.role),
          channelId: result.channelId,
        })
      : false

    return NextResponse.json({
      ok: true,
      channelId: result.channelId,
      warehouseId,
      batchId: batchKey,
      chatActive,
      canManageChatMembers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error sincronitzant el xat.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
