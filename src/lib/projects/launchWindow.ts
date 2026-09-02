export function hasLaunchWindowExpired(value?: string, now: number = Date.now()): boolean {
  const raw = String(value || '').trim()
  if (!raw) return false
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(date.getTime())) return false
  return now >= date.getTime() + 24 * 60 * 60 * 1000
}

export function selectProjectRoomsToArchiveOnLaunch<T>(input: {
  previousLaunchExpired: boolean
  nextLaunchExpired: boolean
  nextRooms: T[]
  addedRooms: T[]
}): T[] {
  if (!input.nextLaunchExpired) return []
  if (!input.previousLaunchExpired) return input.nextRooms
  return input.addedRooms
}
