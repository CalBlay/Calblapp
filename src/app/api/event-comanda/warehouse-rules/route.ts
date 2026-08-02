import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import {
  createEventComandaWarehouseRule,
  listEventComandaWarehouseRules,
} from '@/lib/eventComanda/warehouseRules.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const rules = await listEventComandaWarehouseRules()
  return NextResponse.json({ rules })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const body = (await req.json()) as { prefix?: string; warehouseId?: string }
  try {
    const rule = await createEventComandaWarehouseRule({
      prefix: String(body.prefix || ''),
      warehouseId: String(body.warehouseId || ''),
      userId: auth.user.id,
    })
    return NextResponse.json({ rule })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut crear la regla.' },
      { status: 400 }
    )
  }
}
