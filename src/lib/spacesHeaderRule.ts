export type SpacesHeaderMetricMode = 'pax' | 'events' | 'either' | 'both'
export type SpacesHeaderStage = 'verd' | 'taronja' | 'groc'

export type SpacesHeaderRuleConfig = {
  enabled: boolean
  stages: SpacesHeaderStage[]
  metricMode: SpacesHeaderMetricMode
  paxThreshold: number
  eventsThreshold: number
}

export const DEFAULT_SPACES_HEADER_RULE: SpacesHeaderRuleConfig = {
  enabled: true,
  stages: ['verd'],
  metricMode: 'pax',
  paxThreshold: 1000,
  eventsThreshold: 8,
}

export function normalizeSpacesHeaderRuleConfig(
  input: unknown
): SpacesHeaderRuleConfig {
  const source = (input || {}) as Partial<SpacesHeaderRuleConfig> & {
    stageScope?: 'confirmed' | 'all'
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
