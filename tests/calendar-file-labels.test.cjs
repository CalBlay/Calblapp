const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  formatCalendarFileKeyLabel,
  displayCalendarFileName,
} = require('../src/lib/calendar/calendarFiles')

test('formatCalendarFileKeyLabel maps zohoFileN and fileN keys to Document N', () => {
  assert.equal(formatCalendarFileKeyLabel('zohoFile1'), 'Document 1')
  assert.equal(formatCalendarFileKeyLabel('ZOHOFILE12'), 'Document 12')
  assert.equal(formatCalendarFileKeyLabel('file3'), 'Document 3')
  assert.equal(formatCalendarFileKeyLabel('  file7  '), 'Document 7')
})

test('formatCalendarFileKeyLabel keeps non-slot keys and defaults empty to Document', () => {
  assert.equal(formatCalendarFileKeyLabel('zohoFile'), 'zohoFile')
  assert.equal(formatCalendarFileKeyLabel('zohoFile1extra'), 'zohoFile1extra')
  assert.equal(formatCalendarFileKeyLabel('contract.pdf'), 'contract.pdf')
  assert.equal(formatCalendarFileKeyLabel(''), 'Document')
  assert.equal(formatCalendarFileKeyLabel('   '), 'Document')
})

test('displayCalendarFileName prefers stored name over the slot label', () => {
  assert.equal(
    displayCalendarFileName({ key: 'zohoFile2', url: 'https://x', name: 'FT tast.pdf' }),
    'FT tast.pdf'
  )
  assert.equal(
    displayCalendarFileName({ key: 'zohoFile2', url: 'https://x', name: '  ' }),
    'Document 2'
  )
  assert.equal(
    displayCalendarFileName({ key: 'other', url: 'https://x' }),
    'other'
  )
})
