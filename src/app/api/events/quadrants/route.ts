import { NextRequest, NextResponse } from 'next/server'
import { listQuadrantEventsInRange } from '@/lib/quadrantEvents'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  try {
    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten start i end' }, { status: 400 })
    }

    const events = await listQuadrantEventsInRange(start, end)
    return NextResponse.json({ events }, { status: 200 })
  } catch (err: unknown) {
    console.error('[events/quadrants] Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
