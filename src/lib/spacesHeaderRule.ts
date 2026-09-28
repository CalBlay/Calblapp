export type SpacesHeaderMetricMode = 'pax' | 'events' | 'either' | 'both'
export type SpacesHeaderStage = 'verd' | 'taronja' | 'groc'
export type SpacesManualHighlight = { date: string; reason: string }

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/

export type SpacesHeaderRuleConfig = {
  enabled: boolean
  stages: SpacesHeaderStage[]
  metricMode: SpacesHeaderMetricMode
  paxThreshold: number
  eventsThreshold: number
  manualHighlights: SpacesManualHighlight[]
}

export const DEFAULT_SPACES_HEADER_RULE: SpacesHeaderRuleConfig = {
  enabled: true,
  stages: ['verd'],
  metricMode: 'pax',
  paxThreshold: 1000,
  eventsThreshold: 8,
  manualHighlights: [],
}

export function normalizeSpacesHeaderRuleConfig(
  input: unknown
): SpacesHeaderRuleConfig {
  const source = (input || {}) as Partial<SpacesHeaderRuleConfig> & {
    stageScope?: 'confirmed' | 'all'
    manualHighlightedDates?: unknown
  }
  return {
    enabled:
      typeof source.enabled === 'boolean'
        ? source.enabled
        : DEFAULT_SPACES_HEADER_RULE.enabled,
    stages: normalizeStages(source.stages, source.stageScope),
    metricMode:
      source.metricMode === 'events' ||
      source.metricMode === 'either' ||
      source.metricMode === 'both'
        ? source.metricMode
        : DEFAULT_SPACES_HEADER_RULE.metricMode,
    paxThreshold: sanitizeThreshold(
      source.paxThreshold,
      DEFAULT_SPACES_HEADER_RULE.paxThreshold
    ),
    eventsThreshold: sanitizeThreshold(
      source.eventsThreshold,
      DEFAULT_SPACES_HEADER_RULE.eventsThreshold
    ),
    manualHighlights: normalizeManualHighlights(
      source.manualHighlights,
      source.manualHighlightedDates
    ),
  }
}

export function isSpacesDateManuallyHighlighted(
  config: SpacesHeaderRuleConfig,
  date: string
): boolean {
  return config.manualHighlights.some((highlight) => highlight.date === date)
}

export function spacesManualHighlightReason(
  config: SpacesHeaderRuleConfig,
  date: string
): string | null {
  return (
    config.manualHighlights.find((highlight) => highlight.date === date)
      ?.reason ?? null
  )
}

/** Converteix una data escrita com dd/mm/aaaa a YYYY-MM-DD sense dependre del navegador. */
export function parseSpacesManualDateInput(value: string): string | null {
  const input = value.trim()
  if (ISO_DATE_PATTERN.test(input)) return isValidIsoDate(input) ? input : null

  const match = DAY_FIRST_DATE_PATTERN.exec(input)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isValidIsoDate(iso) ? iso : null
}

export function evaluateSpacesHeaderRule(input: {
  config: SpacesHeaderRuleConfig
  totalPax: number
  totalEvents: number
}): boolean {
  const { config, totalPax, totalEvents } = input
  if (!config.enabled) return false

  const paxMatch = totalPax > config.paxThreshold
  const eventsMatch = totalEvents > config.eventsThreshold

  switch (config.metricMode) {
    case 'events':
      return eventsMatch
    case 'either':
      return paxMatch || eventsMatch
    case 'both':
      return paxMatch && eventsMatch
    case 'pax':
    default:
      return paxMatch
  }
}

function sanitizeThreshold(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.round(numeric))
}

function normalizeStages(
  stages: unknown,
  legacyStageScope?: 'confirmed' | 'all'
): SpacesHeaderStage[] {
  if (Array.isArray(stages)) {
    const validStages = stages.filter(
      (stage): stage is SpacesHeaderStage =>
        stage === 'verd' || stage === 'taronja' || stage === 'groc'
    )
    if (validStages.length > 0) return validStages
  }

  if (legacyStageScope === 'all') {
    return ['verd', 'taronja', 'groc']
  }

  return DEFAULT_SPACES_HEADER_RULE.stages
}

function normalizeManualHighlights(
  value: unknown,
  legacyDates?: unknown
): SpacesManualHighlight[] {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(legacyDates)
      ? legacyDates.map((date) => ({ date, reason: 'Excepció manual' }))
      : []
  const byDate = new Map<string, SpacesManualHighlight>()

  raw.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const date = String((entry as { date?: unknown }).date ?? '').trim()
    const reason = String((entry as { reason?: unknown }).reason ?? '').trim()
    if (!reason || !isValidIsoDate(date)) return
    byDate.set(date, { date, reason: reason.slice(0, 300) })
  })

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function isValidIsoDate(date: string): boolean {
  if (!ISO_DATE_PATTERN.test(date)) return false
  const parsed = new Date(`${date}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}
