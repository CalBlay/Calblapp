import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { computeQuadrantsGet } from '@/lib/api/quadrantsGetRange'
import { QUADRANTS_LIST_CACHE_TAG } from '@/lib/quadrantsListCache'
import {
  hideQuadrantsForCancelledEvents,
  listCancelledQuadrantEventKeysInRange,
  listQuadrantEventsInRange,
} from '@/lib/quadrantEvents'
import { listSurveyKeysByDepartmentAndRange } from '@/lib/quadrantSurveys'
import { requireQuadrantsModuleRead } from '@/lib/server/quadrantsReadAuth'
import {
  applyMeetingDecisionsToDashboard,
} from '@/lib/quadrantsWeeklyMeeting'
import { listMeetingDecisions } from '@/lib/server/quadrantsWeeklyMeetingStore'

export const runtime = 'nodejs'

const DASHBOARD_REVALIDATE_SEC = 90

const normalize = (s?: string | null): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getDashboardCached = unstable_cache(
  async (start: string, end: string, department: string) => {
    const [events, quadrantsResult, surveyKeys, cancelledEventKeys] = await Promise.all([
      listQuadrantEventsInRange(start, end),
      computeQuadrantsGet(start, end, department),
      listSurveyKeysByDepartmentAndRange(department, start, end),
      listCancelledQuadrantEventKeysInRange(start, end),
    ])

    return {
      events,
      quadrants: hideQuadrantsForCancelledEvents(
        quadrantsResult.quadrants,
        cancelledEventKeys
      ),
      surveyKeys,
    }
  },
  ['api-quadrants-dashboard-v3-hide-cancelled'],
  { revalidate: DASHBOARD_REVALIDATE_SEC, tags: [QUADRANTS_LIST_CACHE_TAG] }
)

export async function GET(req: NextRequest) {
  const auth = await requireQuadrantsModuleRead()
  if (!auth.ok) return auth.res

  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const department = normalize(searchParams.get('department') || 'serveis')
    const skipCache = searchParams.get('skipCache') === '1'

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten dates' }, { status: 400 })
    }
    if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
      return NextResponse.json(
        { error: 'start i end han de ser dates YYYY-MM-DD' },
        { status: 400 }
      )
    }

    let payload
    if (skipCache) {
      const [events, quadrantsResult, surveyKeys, cancelledEventKeys] = await Promise.all([
        listQuadrantEventsInRange(start, end),
        computeQuadrantsGet(start, end, department),
        listSurveyKeysByDepartmentAndRange(department, start, end),
        listCancelledQuadrantEventKeysInRange(start, end),
      ])
      payload = {
        events,
        quadrants: hideQuadrantsForCancelledEvents(
          quadrantsResult.quadrants,
          cancelledEventKeys
        ),
        surveyKeys,
      }
    } else {
      payload = await getDashboardCached(start, end, department)
    }

    const decisions = await listMeetingDecisions(start, end)
    const adjusted = applyMeetingDecisionsToDashboard(
      department,
      payload.events,
      payload.quadrants,
      decisions
    )

    return NextResponse.json({ ...payload, ...adjusted })
  } catch (error) {
    console.error('[quadrants/dashboard] ERROR:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
