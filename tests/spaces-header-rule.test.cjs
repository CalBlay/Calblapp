const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_SPACES_HEADER_RULE,
  isSpacesDateManuallyHighlighted,
  normalizeSpacesHeaderRuleConfig,
  parseSpacesManualDateInput,
  spacesManualHighlightReason,
} = require('../src/lib/spacesHeaderRule.ts')

test('manual date input always interprets the day before the month', () => {
  assert.equal(parseSpacesManualDateInput('02/10/2026'), '2026-10-02')
  assert.equal(parseSpacesManualDateInput('2-10-2026'), '2026-10-02')
  assert.equal(parseSpacesManualDateInput('2026-10-02'), '2026-10-02')
  assert.equal(parseSpacesManualDateInput('31/02/2026'), null)
})

test('manual space highlights require a valid date and a reason', () => {
  const config = normalizeSpacesHeaderRuleConfig({
    ...DEFAULT_SPACES_HEADER_RULE,
    manualHighlights: [
      { date: '2026-10-12', reason: '  Muntatge excepcional  ' },
      { date: '2026-02-30', reason: 'Data impossible' },
      { date: '2026-10-13', reason: '   ' },
    ],
  })

  assert.deepEqual(config.manualHighlights, [
    { date: '2026-10-12', reason: 'Muntatge excepcional' },
  ])
  assert.equal(isSpacesDateManuallyHighlighted(config, '2026-10-12'), true)
  assert.equal(spacesManualHighlightReason(config, '2026-10-12'), 'Muntatge excepcional')
  assert.equal(isSpacesDateManuallyHighlighted(config, '2026-10-13'), false)
})

test('manual space highlights keep one reason per date and stay sorted', () => {
  const config = normalizeSpacesHeaderRuleConfig({
    manualHighlights: [
      { date: '2026-12-02', reason: 'Primer motiu' },
      { date: '2026-11-01', reason: 'Anterior' },
      { date: '2026-12-02', reason: 'Motiu actualitzat' },
    ],
  })

  assert.deepEqual(config.manualHighlights, [
    { date: '2026-11-01', reason: 'Anterior' },
    { date: '2026-12-02', reason: 'Motiu actualitzat' },
  ])
})

test('legacy manual date lists remain highlighted with a migration reason', () => {
  const config = normalizeSpacesHeaderRuleConfig({
    manualHighlightedDates: ['2026-10-12'],
  })

  assert.deepEqual(config.manualHighlights, [
    { date: '2026-10-12', reason: 'Excepció manual' },
  ])
})
