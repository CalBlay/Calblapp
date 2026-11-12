const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  filterTicketsBeforeDateRange,
} = require('../src/app/menu/manteniment/preventius/fulls/lib/groupWorkItems')

const filters = {
  start: '2026-11-12',
  end: '2026-11-12',
  mode: 'day',
}

const ticket = (id, date) => ({
  id,
  kind: 'ticket',
  title: id,
  status: 'assignat',
  date,
  startTime: '09:00',
  endTime: '10:00',
})

test('worker pending tickets keeps assigned work outside the selected date range', () => {
  const result = filterTicketsBeforeDateRange(filters, [
    ticket('older', '2026-09-25'),
    ticket('selected-day', '2026-11-12'),
    ticket('future', '2026-11-13'),
  ])

  assert.deepEqual(
    result.map((item) => item.id),
    ['older']
  )
})
