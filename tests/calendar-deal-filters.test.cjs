const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  dealMatchesCalendarLocationFilter,
  isCalendarAllFilter,
  normalizeCalendarFilterValue,
  toCalendarArrayFilter,
} = require('../src/lib/calendar/calendarDealFilters')

test('calendar filter values fold accents and ignore all/tots sentinels', () => {
  assert.equal(normalizeCalendarFilterValue('  Masía  '), 'masia')
  assert.equal(isCalendarAllFilter(''), true)
  assert.equal(isCalendarAllFilter('all'), true)
  assert.equal(isCalendarAllFilter('Tots els centres'), true)
  assert.equal(isCalendarAllFilter('totes'), true)
  assert.equal(isCalendarAllFilter('Masía'), false)
})

test('toCalendarArrayFilter drops blanks and all-values from strings or arrays', () => {
  assert.deepEqual(toCalendarArrayFilter(''), [])
  assert.deepEqual(toCalendarArrayFilter('all'), [])
  assert.deepEqual(toCalendarArrayFilter('Masía'), ['Masía'])
  assert.deepEqual(toCalendarArrayFilter(['Masía', 'all', '  ', 'Nàutic']), ['Masía', 'Nàutic'])
})

test('dealMatchesCalendarLocationFilter is accent-insensitive and no-ops without a filter', () => {
  assert.equal(dealMatchesCalendarLocationFilter('Masía Blay'), true)
  assert.equal(dealMatchesCalendarLocationFilter('Masía Blay', 'all'), true)
  assert.equal(dealMatchesCalendarLocationFilter('Masía Blay', 'Masia Blay'), true)
  assert.equal(dealMatchesCalendarLocationFilter('Masía Blay', ['Nàutic', 'masia blay']), true)
  assert.equal(dealMatchesCalendarLocationFilter('Masía Blay', 'Nàutic'), false)
  assert.equal(dealMatchesCalendarLocationFilter('', 'Masía'), false)
})

test('calendar hook applies the shared location filter helper', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src/hooks/useCalendarData.ts'),
    'utf8'
  )
  assert.match(source, /dealMatchesCalendarLocationFilter\(d\.Ubicacio, filters\?\.location\)/)
})
