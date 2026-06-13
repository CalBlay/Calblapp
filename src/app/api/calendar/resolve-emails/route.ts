import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { resolveEmailsByNames } from '@/lib/calendar/calendarEmail'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as { names?: string[] }
    const names = Array.isArray(body.names) ? body.names : []
    const resolved = await resolveEmailsByNames(names)

    return NextResponse.json({ resolved })
  } catch (err) {
    console.error('[calendar/resolve-emails POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}
