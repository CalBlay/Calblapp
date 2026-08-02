import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import { getWarehouseMembers, setWarehouseMembers } from '@/lib/eventComanda/warehouseMembers.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const { id } = await params
  const record = await getWarehouseMembers(id)
  return NextResponse.json(record)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const { id } = await params
  const body = (await req.json()) as { memberIds?: string[] }

  try {
    const record = await setWarehouseMembers({
      warehouseId: id,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds : [],
      userId: auth.user.id,
    })
    return NextResponse.json(record)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'han pogut desar els membres.' },
      { status: 400 }
    )
  }
}
