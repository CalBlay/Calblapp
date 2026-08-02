import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import { deleteEventComandaUnit, updateEventComandaUnit } from '@/lib/eventComanda/units.server'
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
  const body = (await req.json()) as { name?: string; isActive?: boolean; sortOrder?: number }

  try {
    const unit = await updateEventComandaUnit(id, {
      name: body.name,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
      userId: auth.user.id,
    })
    return NextResponse.json({ unit })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut actualitzar la unitat.' },
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
    await deleteEventComandaUnit(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut eliminar la unitat.' },
      { status: 400 }
    )
  }
}
