/** Ordena dies d’incidències: més propers a avui primer, després els més llunyans. */
export function sortIncidentDayKeysByProximityToToday(days: string[]): string[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()

  return [...days].sort((a, b) => {
    const da = Date.parse(`${a}T00:00:00`)
    const db = Date.parse(`${b}T00:00:00`)
    if (Number.isNaN(da) && Number.isNaN(db)) return a.localeCompare(b)
    if (Number.isNaN(da)) return 1
    if (Number.isNaN(db)) return -1

    const distA = Math.abs(da - todayMs)
    const distB = Math.abs(db - todayMs)
    if (distA !== distB) return distA - distB

    if (da >= todayMs && db >= todayMs) return da - db
    if (da < todayMs && db < todayMs) return db - da
    return da >= todayMs ? -1 : 1
  })
}
