export type SpacesHeaderStageScope = 'confirmed' | 'all'
export type SpacesHeaderMetricMode = 'pax' | 'events' | 'either' | 'both'

export type SpacesHeaderRuleConfig = {
  enabled: boolean
  stageScope: SpacesHeaderStageScope
  metricMode: SpacesHeaderMetricMode
  paxThreshold: number
  eventsThreshold: number
}

export const DEFAULT_SPACES_HEADER_RULE: SpacesHeaderRuleConfig = {
  enabled: true,
  stageScope: 'confirmed',
  metricMode: 'pax',
  paxThreshold: 1000,
  eventsThreshold: 8,
}

export function normalizeSpacesHeaderRuleConfig(
  input: unknown
): SpacesHeaderRuleConfig {
  const source = (input || {}) as Partial<SpacesHeaderRuleConfig>
  return {
    enabled:
      typeof source.enabled === 'boolean'
        ? source.enabled
        : DEFAULT_SPACES_HEADER_RULE.enabled,
    stageScope:
      source.stageScope === 'all' ? 'all' : DEFAULT_SPACES_HEADER_RULE.stageScope,
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
  }
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
