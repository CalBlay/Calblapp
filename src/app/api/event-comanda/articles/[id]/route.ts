import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import { updateEventComandaArticle } from '@/lib/eventComanda/articles.server'
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
  const body = (await req.json()) as { unit?: string; warehouseId?: string | null }

  try {
    const article = await updateEventComandaArticle(id, {
      unit: body.unit,
      warehouseId: body.warehouseId,
      userId: auth.user.id,
    })
    return NextResponse.json({ article })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut actualitzar l\'article.' },
      { status: 400 }
    )
  }
}
