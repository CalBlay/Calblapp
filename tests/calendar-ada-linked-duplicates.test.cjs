const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  filterAdaLinkedMainEventDuplicates,
} = require('../src/lib/calendar/calendarAdaLinkedDuplicates.ts')

test('hides the old linked main event but keeps the confirmed event and its PM', () => {
  const events = [
    {
      id: 'confirmed',
      collection: 'stage_verd',
      code: 'E2700036',
    },
    {
      id: 'old-main',
      collection: 'stage_groc',
      code: 'E2700036',
      adaLinkedMenuTasting: true,
    },
    {
      id: 'old-pm',
      collection: 'stage_groc',
      code: 'E2700036',
      adaLinkedMenuTasting: true,
      calendarOccurrenceType: 'menu_tasting_company',
    },
  ]

  assert.deepEqual(
    filterAdaLinkedMainEventDuplicates(events).map((event) => event.id),
    ['confirmed', 'old-pm']
  )
})

test('does not hide unrelated or unlinked commercial-stage events', () => {
  const events = [
    { id: 'confirmed', collection: 'stage_verd', code: 'E2700036' },
    { id: 'other', collection: 'stage_groc', code: 'E2700099' },
    { id: 'legacy', collection: 'stage_groc', code: 'E2700036' },
  ]

  assert.equal(filterAdaLinkedMainEventDuplicates(events).length, 3)
})
