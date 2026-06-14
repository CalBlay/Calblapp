import type { UnifiedEvent } from '@/app/menu/quadrants/types'

export type GroupedQuadrantEvent = {
  eventId: string
  eventCode: string
  summary: string
  ln: string | null
  location: string | null
  numPax: number | null
  commercial: string | null
  service: string | null
  phases: UnifiedEvent[]
}

export type GroupedQuadrantDay = {
  day: string
  events: GroupedQuadrantEvent[]
  totalPax: number
}

export function groupQuadrantsByDayAndEvent(rows: UnifiedEvent[]): GroupedQuadrantDay[] {
  const dayMap = new Map<string, Map<string, GroupedQuadrantEvent>>()

  for (const ev of rows) {
    const day = ev.start ? ev.start.slice(0, 10) : ''
    if (!day) continue

    const eventId = String(ev.eventId || ev.code || ev.id || '').trim()
    if (!eventId) continue

    if (!dayMap.has(day)) dayMap.set(day, new Map())
    const eventMap = dayMap.get(day)!

    if (!eventMap.has(eventId)) {
      eventMap.set(eventId, {
        eventId,
        eventCode: String(ev.code || ev.eventCode || ''),
        summary: ev.summary,
        ln: ev.ln ?? null,
        location: ev.location ?? null,
        numPax: ev.numPax ?? null,
        commercial: ev.commercial ?? null,
        service: ev.service ?? null,
        phases: [],
      })
    }

    eventMap.get(eventId)!.phases.push(ev)
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, eventMap]) => {
      const events = Array.from(eventMap.values())
      events.forEach((event) => {
        event.phases.sort((a, b) => {
          const tA = a.displayStartTime || ''
          const tB = b.displayStartTime || ''
          return tA.localeCompare(tB)
        })
      })
      events.sort((a, b) => {
        const tA = a.phases[0]?.displayStartTime || ''
        const tB = b.phases[0]?.displayStartTime || ''
        return tA.localeCompare(tB)
      })
      const totalPax = events.reduce((sum, event) => sum + Number(event.numPax || 0), 0)
      return { day, events, totalPax }
    })
}

/** Agrupació plana per dia — una fila per fase (vista operativa). */
export function groupQuadrantsByDay(rows: UnifiedEvent[]): [string, UnifiedEvent[]][] {
  const map: Record<string, UnifiedEvent[]> = {}
  for (const ev of rows) {
    const day = ev.start ? ev.start.slice(0, 10) : ''
    if (!day) continue
    if (!map[day]) map[day] = []
    map[day].push(ev)
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
}
