import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { isPreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { resolvePreparationMissingArticlesForLoading } from '@/lib/logistics/preparationForm.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'direccio', 'cap', 'treballador'] as const

export async function PATCH(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ALLOWED_ROLES)
  if (forbidden) return forbidden.res
  const body = (await req.json().catch(() => ({}))) as {
    resolution?: string
    refs?: Array<{ eventRowId?: string; warehouseCode?: string; articleCode?: string }>
  }
  const resolution = body.resolution
  if (resolution !== 'prepared' && resolution !== 'left_unprepared') {
    return NextResponse.json({ error: 'Resolució no vàlida.' }, { status: 400 })
  }
  const refs = (Array.isArray(body.refs) ? body.refs : []).flatMap((item) => {
    const warehouseCode = String(item.warehouseCode || '').trim().toUpperCase()
    if (!isPreparationWarehouseCode(warehouseCode)) return []
    return [{
      eventRowId: String(item.eventRowId || '').trim(),
      warehouseCode,
      articleCode: String(item.articleCode || '').trim(),
    }]
  })

  try {
    const result = await resolvePreparationMissingArticlesForLoading({
      refs,
      resolution,
      userId: auth.user.id,
      userName: String(auth.user.name || '').trim(),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut actualitzar el pendent.' },
      { status: 400 }
    )
  }
}
