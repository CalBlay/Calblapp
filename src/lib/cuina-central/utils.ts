export const cleanText = (value: unknown) => String(value ?? '').trim()

export const slugDocId = (code: string) =>
  cleanText(code)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `item-${Date.now()}`

export const parseNumber = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export const pickCell = (row: Record<string, unknown>, keys: string[]) => {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v])
  )
  for (const key of keys) {
    const hit = normalized[normalizeKey(key)]
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') {
      return cleanText(hit)
    }
  }
  return ''
}

const normalizeKey = (key: string) =>
  key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** HH:mm → minuts des de mitjanit */
export const timeToMinutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(cleanText(hhmm))
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

export const shiftDurationMinutes = (startTime: string, endTime: string) => {
  const start = timeToMinutes(startTime)
  let end = timeToMinutes(endTime)
  if (end <= start) end += 24 * 60
  return Math.max(0, end - start)
}

export const isoDurationMinutes = (startedAt: string, endedAt: string) => {
  const a = new Date(startedAt).getTime()
  const b = new Date(endedAt).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round((b - a) / 60_000)
}

export const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export const toCustomFields = (value: unknown): Record<string, string | number | boolean | null> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  return out
}
