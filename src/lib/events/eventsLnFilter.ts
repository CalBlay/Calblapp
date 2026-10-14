type EventWithLn = {
  lnKey?: string
}

export function toggleEventLnSelection<T extends string>(selected: T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]
}

export function filterEventsByLns<T extends EventWithLn>(
  events: T[],
  selected: string[] = []
): T[] {
  if (selected.length === 0) return events
  const selectedSet = new Set(selected)
  return events.filter((event) => Boolean(event.lnKey && selectedSet.has(event.lnKey)))
}
