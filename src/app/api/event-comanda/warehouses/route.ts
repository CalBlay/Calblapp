import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import {
  createEventComandaWarehouse,
  listEventComandaWarehouses,
} from '@/lib/eventComanda/warehouses.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const warehouses = await listEventComandaWarehouses()
  return NextResponse.json({ warehouses })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const body = (await req.json()) as { code?: string; name?: string; sortOrder?: number }
  try {
    const warehouse = await createEventComandaWarehouse({
      code: String(body.code || ''),
      name: String(body.name || ''),
      sortOrder: body.sortOrder,
      userId: auth.user.id,
    })
    return NextResponse.json({ warehouse })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut crear el magatzem.' },
      { status: 400 }
    )
  }
}
