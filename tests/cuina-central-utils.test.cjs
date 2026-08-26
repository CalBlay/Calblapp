const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  cleanText,
  isoDurationMinutes,
  median,
  parseNumber,
  pickCell,
  shiftDurationMinutes,
  slugDocId,
  timeToMinutes,
  toCustomFields,
} = require('../src/lib/cuina-central/utils')

test('timeToMinutes parses HH:mm and rejects incomplete minutes', () => {
  assert.equal(timeToMinutes('08:00'), 480)
  assert.equal(timeToMinutes('8:30'), 510)
  assert.equal(timeToMinutes(' 22:15 '), 1335)
  assert.equal(timeToMinutes('8:0'), 0)
  assert.equal(timeToMinutes('nope'), 0)
  assert.equal(timeToMinutes(''), 0)
})

test('shiftDurationMinutes wraps overnight and equal-clock shifts across midnight', () => {
  assert.equal(shiftDurationMinutes('08:00', '16:00'), 480)
  assert.equal(shiftDurationMinutes('22:00', '06:00'), 480)
  assert.equal(shiftDurationMinutes('00:00', '00:00'), 1440)
  assert.equal(shiftDurationMinutes('23:00', '23:00'), 1440)
})

test('shiftDurationMinutes treats unparsable times as midnight (24h wrap)', () => {
  assert.equal(shiftDurationMinutes('', ''), 1440)
  // start invalid (00:00) → end 08:00 is an 8h morning shift
  assert.equal(shiftDurationMinutes('bad', '08:00'), 480)
  // end invalid (00:00) after 22:00 wraps to next midnight → 2h
  assert.equal(shiftDurationMinutes('22:00', 'bad'), 120)
})

test('isoDurationMinutes rounds minutes and rejects inverted or invalid ranges', () => {
  assert.equal(
    isoDurationMinutes('2026-08-26T08:00:00.000Z', '2026-08-26T09:30:00.000Z'),
    90
  )
  assert.equal(
    isoDurationMinutes('2026-08-26T08:00:00.000Z', '2026-08-26T08:01:30.000Z'),
    2
  )
  assert.equal(
    isoDurationMinutes('2026-08-26T10:00:00.000Z', '2026-08-26T09:00:00.000Z'),
    0
  )
  assert.equal(isoDurationMinutes('not-a-date', '2026-08-26T09:00:00.000Z'), 0)
})

test('parseNumber uses finite numbers and the provided fallback', () => {
  assert.equal(parseNumber('12.5'), 12.5)
  assert.equal(parseNumber(0), 0)
  assert.equal(parseNumber('nope', 7), 7)
  assert.equal(parseNumber(undefined), 0)
  assert.equal(parseNumber(Number.NaN, 3), 3)
})

test('pickCell matches keys after accent-fold and skips blank cells', () => {
  const row = {
    Codi: '   ',
    'Nóm': 'Base tomàquet',
    Extra: 'keep',
  }
  assert.equal(pickCell(row, ['codi', 'nom']), 'Base tomàquet')
  assert.equal(pickCell(row, ['missing', 'extra']), 'keep')
  assert.equal(pickCell(row, ['codi']), '')
})

test('slugDocId folds accents and falls back to a timestamp id for empty input', () => {
  assert.equal(slugDocId('Café 1!'), 'cafe-1')
  assert.equal(slugDocId('  BASE  TOMÀQUET  '), 'base-tomaquet')

  const originalNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    assert.equal(slugDocId('---'), 'item-1700000000000')
    assert.equal(slugDocId(''), 'item-1700000000000')
  } finally {
    Date.now = originalNow
  }
})

test('median returns null for empty input and does not mutate the source', () => {
  assert.equal(median([]), null)
  const odd = [3, 1, 2]
  assert.equal(median(odd), 2)
  assert.deepEqual(odd, [3, 1, 2])
  assert.equal(median([1, 2, 3, 4]), 2.5)
})

test('toCustomFields keeps primitives and drops nested values', () => {
  assert.deepEqual(toCustomFields(null), {})
  assert.deepEqual(toCustomFields(['x']), {})
  assert.deepEqual(
    toCustomFields({ a: 'ok', b: 1, c: false, d: null, nested: { x: 1 }, arr: [] }),
    { a: 'ok', b: 1, c: false, d: null }
  )
})

test('cleanText stringifies and trims', () => {
  assert.equal(cleanText('  hi  '), 'hi')
  assert.equal(cleanText(12), '12')
  assert.equal(cleanText(null), '')
})
