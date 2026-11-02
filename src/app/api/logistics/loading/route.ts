import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import {
  listLogisticsLoadingEvents,
  setLogisticsLoadingLine,
} from '@/lib/logistics/logisticsLoading.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'direccio', 'cap', 'treballador'] as const
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ALLOWED_ROLES)
  if (forbidden) return forbidden.res
  const { searchParams } = new URL(req.url)
  const start = String(searchParams.get('start') || '').trim()
  const end = String(searchParams.get('end') || '').trim()
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    return NextResponse.json({ error: 'Rang de dates no vàlid.' }, { status: 400 })
  }

  try {
    const events = await listLogisticsLoadingEvents(start, end)
    return NextResponse.json({ ok: true, events })
  } catch (error) {
    console.error('[logistics/loading] GET error', error)
    return NextResponse.json({ error: 'No s’ha pogut carregar la llista.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ALLOWED_ROLES)
  if (forbidden) return forbidden.res
  const body = (await req.json().catch(() => ({}))) as {
    eventKey?: string
    lineKey?: string
    loaded?: boolean
    quantity?: number
  }

  try {
    const state = await setLogisticsLoadingLine({
      eventKey: String(body.eventKey || ''),
      lineKey: String(body.lineKey || ''),
      loaded: body.loaded === true,
      quantity: Number(body.quantity) || 0,
      userId: auth.user.id,
      userName: String(auth.user.name || '').trim(),
    })
    return NextResponse.json({ ok: true, state })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut actualitzar la càrrega.' },
      { status: 400 }
    )
  }
}
