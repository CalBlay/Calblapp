import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { requireAuth } from '@/lib/server/apiAuth'
import {
  DEFAULT_SPACES_HEADER_RULE,
  evaluateSpacesHeaderRule,
  normalizeSpacesHeaderRuleConfig,
} from '@/lib/spacesHeaderRule'
import { isActiveSpaceReservation } from '@/lib/spacesReservationStatus'
import { getSpacesByWeek } from '@/services/spaces/spaces'

export const runtime = 'nodejs'

const SETTINGS_COLLECTION = 'space_settings'
const HEADER_RULE_DOC = 'reserve_header_rule'

type SpaceEvent = {
  numPax?: unknown
  NumPax?: unknown
  stage?: unknown
  StageGroup?: unknown
  cancelled?: unknown
}

const eventPax = (event: SpaceEvent): number => {
  const value = Number(event.numPax ?? event.NumPax)
  return Number.isFinite(value) ? value : 0
}

const eventStage = (event: SpaceEvent): string =>
  String(event.stage ?? event.StageGroup ?? '').trim().toLowerCase()

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  try {
    const start = req.nextUrl.searchParams.get('start')
    if (!start || !isIsoDateDayParam(start)) {
      return NextResponse.json(
        { error: 'start ha de ser una data YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const anchor = new Date(`${start}T12:00:00`)
    const month = anchor.getMonth()
    const year = anchor.getFullYear()

    const [spacesResult, settingsSnap] = await Promise.all([
      getSpacesByWeek(
        month,
        year,
        '',
        '',
        start,
        'all',
        '',
        true,
        'month'
      ),
      firestoreAdmin.collection(SETTINGS_COLLECTION).doc(HEADER_RULE_DOC).get(),
    ])

    const config = normalizeSpacesHeaderRuleConfig(
      settingsSnap.exists
        ? settingsSnap.data()?.config
        : DEFAULT_SPACES_HEADER_RULE
    )
    const eventsByDate = new Map<string, SpaceEvent[]>()

    spacesResult.data.forEach((row) => {
      row.dies.forEach((day) => {
        if (!day.events.length) return
        const events = eventsByDate.get(day.date) ?? []
        events.push(...day.events)
        eventsByDate.set(day.date, events)
      })
    })

    const automaticDays = Array.from(eventsByDate.entries())
      .filter(([, events]) => {
        const scopedEvents = events.filter(
          (event) =>
            isActiveSpaceReservation(event) &&
            eventStage(event) !== 'lila' &&
            config.stages.includes(eventStage(event) as 'verd' | 'taronja' | 'groc')
        )

        return evaluateSpacesHeaderRule({
          config,
          totalPax: scopedEvents.reduce((sum, event) => sum + eventPax(event), 0),
          totalEvents: scopedEvents.length,
        })
      })
      .map(([date]) => date)

    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    const days = Array.from(
      new Set([
        ...automaticDays,
        ...config.manualHighlights
          .map((highlight) => highlight.date)
          .filter((date) => date.startsWith(monthPrefix)),
      ])
    ).sort()

    const manualReasons = Object.fromEntries(
      config.manualHighlights
        .filter((highlight) => highlight.date.startsWith(monthPrefix))
        .map((highlight) => [highlight.date, highlight.reason])
    )

    return NextResponse.json({ days, manualReasons })
  } catch (error) {
    console.error('[api/calendar/space-highlights]', error)
    return NextResponse.json(
      { error: 'No s\'han pogut calcular els dies destacats d\'espais' },
      { status: 500 }
    )
  }
}
