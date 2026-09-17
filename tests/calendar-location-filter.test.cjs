const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildCalendarLocationOptions,
  filterCalendarDealsByLocations,
} = require('../src/lib/calendar/calendarLocationFilter.ts')

test('calendar location filter handles many selections without changing the source', () => {
  const deals = Array.from({ length: 500 }, (_, index) => ({
    id: String(index),
    Ubicacio: `Espai ${index}`,
  }))
  const selected = Array.from({ length: 250 }, (_, index) => `Espai ${index * 2}`)

  const filtered = filterCalendarDealsByLocations(deals, selected)

  assert.equal(filtered.length, 250)
  assert.equal(filtered[0].id, '0')
  assert.equal(filtered.at(-1).id, '498')
  assert.equal(deals.length, 500)
})

test('calendar location matching ignores case and accents', () => {
  const deals = [
    { id: '1', Ubicacio: 'Masia Can Riera' },
    { id: '2', Ubicacio: 'Saló Mirador' },
  ]

  assert.deepEqual(
    filterCalendarDealsByLocations(deals, ['salo mirador']).map((deal) => deal.id),
    ['2']
  )
})

test('calendar location options discard invalid values and remove duplicates', () => {
  const options = buildCalendarLocationOptions([
    { Ubicacio: '  Masia  ' },
    { Ubicacio: 'Masia' },
    { Ubicacio: '' },
    { Ubicacio: undefined },
  ])

  assert.deepEqual(options, ['Masia'])
})
