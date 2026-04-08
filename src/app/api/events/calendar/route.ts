import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { computeCalendarEventsInRange } from '@/lib/api/calendarEventsRange'

export const runtime = 'nodejs'

const RANGE_REVALIDATE_SEC = 90

const getCalendarEventsCached = unstable_cache(
  async (start: string, end: string) => computeCalendarEventsInRange(start, end),
  ['api-events-calendar-v1'],
  { revalidate: RANGE_REVALIDATE_SEC }
)

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten start i end' }, { status: 400 })
    }
    if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
      return NextResponse.json(
        { error: 'start i end han de ser dates YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const { events: base } = await getCalendarEventsCached(start, end)

    console.log(`[events/calendar] Total esdeveniments trobats: ${base.length}`)
    console.info('[events/calendar] completed', {
      durationMs: Date.now() - startedAt,
      start,
      end,
      returned: base.length,
      collections: 2,
    })

    return NextResponse.json({ events: base }, { status: 200 })
  } catch (err) {
    console.error('[api/events/calendar] Error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
