const test = require('node:test')
const assert = require('node:assert/strict')

const {
  filterEventsByLns,
  toggleEventLnSelection,
} = require('../src/lib/events/eventsLnFilter.ts')

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
