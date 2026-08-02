import { NextResponse } from 'next/server'
import {
  filterEventIdsWithWarehouseOrders,
  listWarehouseComandaEventsForUser,
  listWarehouseComandaHistoryEventsForUser,
} from '@/lib/eventComanda/warehouseEvents.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const body = (await req.json().catch(() => ({}))) as {
    eventIds?: unknown
    start?: string
    end?: string
    history?: boolean
  }

  const startDay = String(body.start || '').slice(0, 10)
  const endDay = String(body.end || '').slice(0, 10)
  const role = normalizeRole(auth.user.role)
  const history = Boolean(body.history)

  if (startDay && endDay) {
    const events = history
      ? await listWarehouseComandaHistoryEventsForUser({
          userId: auth.user.id,
          role,
          startDay,
          endDay,
        })
      : await listWarehouseComandaEventsForUser({
          userId: auth.user.id,
          role,
          startDay,
          endDay,
        })
    return NextResponse.json({
      events,
      eventIds: events.map((event) => event.id),
      history,
    })
  }

  const eventIds = Array.isArray(body.eventIds)
    ? body.eventIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []

  const filtered = await filterEventIdsWithWarehouseOrders(eventIds, auth.user.id, role)

  return NextResponse.json({ eventIds: filtered })
}
