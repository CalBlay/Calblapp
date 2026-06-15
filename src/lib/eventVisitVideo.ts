export const VISIT_VIDEO_FIELD_PREFIX = 'visitVideo'
export const MAX_EVENT_VISIT_VIDEOS = 3

export function visitVideoFieldKey(index: number): string {
  return `${VISIT_VIDEO_FIELD_PREFIX}${index}`
}

export function nextVisitVideoField(existingKeys: string[]): string | null {
  for (let i = 1; i <= MAX_EVENT_VISIT_VIDEOS; i++) {
    const key = visitVideoFieldKey(i)
    if (!existingKeys.includes(key)) return key
  }
  return null
}

export function listVisitVideoFieldKeys(data: Record<string, unknown>): string[] {
  return Object.keys(data)
    .filter((key) => /^visitVideo\d+$/i.test(key))
    .filter((key) => {
      const value = data[key]
      return typeof value === 'string' && value.trim().length > 0
    })
    .sort((a, b) => {
      const na = Number(a.replace(/\D/g, '')) || 0
      const nb = Number(b.replace(/\D/g, '')) || 0
      return na - nb
    })
}
