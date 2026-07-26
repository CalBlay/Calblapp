const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  DEFAULT_SPACES_HEADER_RULE,
  evaluateSpacesHeaderRule,
  normalizeSpacesHeaderRuleConfig,
} = require('../src/lib/spacesHeaderRule')

test('normalizeSpacesHeaderRuleConfig applies defaults and sanitizes thresholds', () => {
  assert.deepEqual(normalizeSpacesHeaderRuleConfig(null), DEFAULT_SPACES_HEADER_RULE)
  assert.deepEqual(normalizeSpacesHeaderRuleConfig(undefined), DEFAULT_SPACES_HEADER_RULE)

  const normalized = normalizeSpacesHeaderRuleConfig({
    enabled: false,
    metricMode: 'both',
    paxThreshold: -12.4,
    eventsThreshold: '3.6',
    stages: ['verd', 'groc', 'invalid'],
  })

  assert.equal(normalized.enabled, false)
  assert.equal(normalized.metricMode, 'both')
  assert.equal(normalized.paxThreshold, 0)
  assert.equal(normalized.eventsThreshold, 4)
  assert.deepEqual(normalized.stages, ['verd', 'groc'])
})

test('normalizeSpacesHeaderRuleConfig keeps legacy stageScope=all when stages missing', () => {
  const normalized = normalizeSpacesHeaderRuleConfig({
    stageScope: 'all',
    metricMode: 'either',
  })

  assert.deepEqual(normalized.stages, ['verd', 'taronja', 'groc'])
  assert.equal(normalized.metricMode, 'either')
})

test('evaluateSpacesHeaderRule honors enabled flag and metric modes', () => {
  const base = {
    ...DEFAULT_SPACES_HEADER_RULE,
    enabled: true,
    paxThreshold: 1000,
    eventsThreshold: 8,
  }

  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, enabled: false }, totalPax: 2000, totalEvents: 20 }),
    false
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'pax' }, totalPax: 1001, totalEvents: 1 }),
    true
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'pax' }, totalPax: 1000, totalEvents: 99 }),
    false
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'events' }, totalPax: 1, totalEvents: 9 }),
    true
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'either' }, totalPax: 1, totalEvents: 9 }),
    true
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'either' }, totalPax: 1001, totalEvents: 1 }),
    true
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'both' }, totalPax: 1001, totalEvents: 9 }),
    true
  )
  assert.equal(
    evaluateSpacesHeaderRule({ config: { ...base, metricMode: 'both' }, totalPax: 1001, totalEvents: 8 }),
    false
  )
})
