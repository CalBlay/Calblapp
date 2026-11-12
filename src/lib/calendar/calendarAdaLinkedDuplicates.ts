type CalendarAdaLinkedEvent = Record<string, unknown> & {
  code?: unknown
  collection?: unknown
  calendarOccurrenceType?: unknown
  adaLinkedMenuTasting?: unknown
}

const normalizedCode = (value: unknown) =>
  String(value || '').trim().toUpperCase()

/**
 * Quan una oportunitat antiga queda vinculada per ADA a un esdeveniment verd,
 * conserva les seves PM però no torna a aparèixer com a esdeveniment principal.
 */
export function filterAdaLinkedMainEventDuplicates<T extends CalendarAdaLinkedEvent>(
  events: T[]
): T[] {
  const confirmedCodes = new Set(
    events
      .filter(
        (event) =>
          event.collection === 'stage_verd' && !event.calendarOccurrenceType
      )
      .map((event) => normalizedCode(event.code))
      .filter(Boolean)
  )

  return events.filter((event) => {
    if (event.calendarOccurrenceType) return true
    if (event.collection === 'stage_verd') return true
    if (event.adaLinkedMenuTasting !== true) return true
    return !confirmedCodes.has(normalizedCode(event.code))
  })
}
