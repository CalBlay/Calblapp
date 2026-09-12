import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import {
  createManualService,
  createRecurringManualServices,
  deleteManualService,
  listManualServicesByDateRange,
  updateManualService,
  type ManualServiceInput,
} from '@/lib/costServeis/manualServices'
import type { ManualServiceRecurrence } from '@/lib/costServeis/manualRecurrence'
import { COST_SERVEIS_DEPARTMENTS } from '@/lib/costServeis/types'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const EDICIO_PATH = `${MODULE_PATH}/edicio`

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView = await canViewUiPath({ user: auth.user, path: MODULE_PATH })
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const from = String(req.nextUrl.searchParams.get('from') || '').slice(0, 10)
  const to = String(req.nextUrl.searchParams.get('to') || '').slice(0, 10)
  if (!isIsoDateDayParam(from) || !isIsoDateDayParam(to)) {
    return NextResponse.json(
      { error: 'Paràmetres from/to obligatoris (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const items = await listManualServicesByDateRange(from, to)
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[cost-serveis/manual-services GET]', err)
    return NextResponse.json({ error: 'Error carregant serveis manuals' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: EDICIO_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as
    | (ManualServiceInput & { recurrence?: ManualServiceRecurrence })
    | null
  if (!body) {
    return NextResponse.json({ error: 'Cos invàlid' }, { status: 400 })
  }

  try {
    if (body.recurrence) {
      const result = await createRecurringManualServices(
        body,
        body.recurrence,
        auth.user.id
      )
      return NextResponse.json(
        { items: result.items, seriesId: result.seriesId, count: result.items.length },
        { status: 201 }
      )
    }
    const item = await createManualService(body, auth.user.id)
    return NextResponse.json({ item }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 400 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: EDICIO_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as
    | (Partial<ManualServiceInput> & { id?: string })
    | null
  const id = String(body?.id || '').trim()
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }
  if (body?.dept && !(COST_SERVEIS_DEPARTMENTS as readonly string[]).includes(body.dept)) {
    return NextResponse.json({ error: 'Departament invàlid' }, { status: 400 })
  }

  try {
    const { id: _id, ...rest } = body || {}
    const item = await updateManualService(id, rest, auth.user.id)
    return NextResponse.json({ item })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 400 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: EDICIO_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = String(req.nextUrl.searchParams.get('id') || '').trim()
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  try {
    await deleteManualService(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 400 }
    )
  }
}
