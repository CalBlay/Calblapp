import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import {
  deleteEventComandaWarehouseRule,
  updateEventComandaWarehouseRule,
} from '@/lib/eventComanda/warehouseRules.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const { id } = await params
  const body = (await req.json()) as { warehouseId?: string }

  try {
    const rule = await updateEventComandaWarehouseRule(id, {
      warehouseId: String(body.warehouseId || ''),
      userId: auth.user.id,
    })
    return NextResponse.json({ rule })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut actualitzar la regla.' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const { id } = await params
  try {
    await deleteEventComandaWarehouseRule(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut eliminar la regla.' },
      { status: 400 }
    )
  }
}
