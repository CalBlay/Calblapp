const test = require('node:test')
const assert = require('node:assert/strict')

const {
  defaultEventLnSelection,
  formatEventLnLabel,
  filterEventsByLns,
  normalizeEventLnKey,
  toggleEventLnSelection,
} = require('../src/lib/events/eventsLnFilter.ts')

test('restaurant groups keep their own business line', () => {
  assert.equal(normalizeEventLnKey('Grups Restaurants'), 'grups restaurants')
  assert.equal(normalizeEventLnKey('  RESTAURANTS  '), 'grups restaurants')
  assert.equal(formatEventLnLabel('grups restaurants'), 'Grups Restaurants')
})

test('restaurant groups are excluded from the default event view', () => {
  const selection = defaultEventLnSelection()
  assert.equal(selection.includes('grups restaurants'), false)
  assert.equal(selection.includes('empresa'), true)
  assert.deepEqual(defaultEventLnSelection('foodlovers'), ['foodlovers'])
})

test('event LN selection adds and removes independent values', () => {
  const first = toggleEventLnSelection([], 'empresa')
  const second = toggleEventLnSelection(first, 'casaments')

  assert.deepEqual(second, ['empresa', 'casaments'])
  assert.deepEqual(toggleEventLnSelection(second, 'empresa'), ['casaments'])
})

test('event LN filter returns events matching any selected LN', () => {
  const events = [
    { id: '1', lnKey: 'empresa' },
    { id: '2', lnKey: 'casaments' },
    { id: '3', lnKey: 'agenda' },
  ]

  assert.deepEqual(
    filterEventsByLns(events, ['empresa', 'agenda']).map((event) => event.id),
    ['1', '3']
  )
})

test('no selected LN means all business lines', () => {
  const events = [{ lnKey: 'empresa' }, { lnKey: 'altres' }]
  assert.equal(filterEventsByLns(events, []), events)
})
