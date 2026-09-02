const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  dealOverlapsDay,
  dealsForDay,
} = require('../src/lib/calendarDealDates')

function deal(overrides = {}) {
  return {
    id: 'd1',
    NomEvent: 'Event',
    Comercial: 'A',
    StageGroup: 'verd',
    Color: '#000',
    ...overrides,
  }
}

test('dealOverlapsDay is false when start date fields are missing or invalid', () => {
  assert.equal(dealOverlapsDay(deal({}), '2026-06-15'), false)
  assert.equal(dealOverlapsDay(deal({ DataInici: 'short' }), '2026-06-15'), false)
  assert.equal(dealOverlapsDay(deal({ DataInici: '2026-06-15' }), 'not-a-day'), false)
})

test('dealOverlapsDay prefers DataInici/DataFi and includes inclusive day range', () => {
  const multi = deal({
    DataInici: '2026-06-10T12:00:00.000Z',
    DataFi: '2026-06-12T18:00:00.000Z',
  })
  assert.equal(dealOverlapsDay(multi, '2026-06-09'), false)
  assert.equal(dealOverlapsDay(multi, '2026-06-10'), true)
  assert.equal(dealOverlapsDay(multi, '2026-06-11'), true)
  assert.equal(dealOverlapsDay(multi, '2026-06-12'), true)
  assert.equal(dealOverlapsDay(multi, '2026-06-13'), false)
})

test('dealOverlapsDay falls back to Data and uses start as end when DataFi missing', () => {
  const single = deal({ Data: '2026-07-01' })
  assert.equal(dealOverlapsDay(single, '2026-07-01'), true)
  assert.equal(dealOverlapsDay(single, '2026-07-02'), false)

  const startOnly = deal({ DataInici: '2026-07-03' })
  assert.equal(dealOverlapsDay(startOnly, '2026-07-03'), true)
  assert.equal(dealOverlapsDay(startOnly, '2026-07-04'), false)
})

test('dealsForDay filters overlaps and sorts by HoraInici then NomEvent (ca)', () => {
  const deals = [
    deal({ id: 'b', NomEvent: 'Boda', DataInici: '2026-08-01', HoraInici: '14:00' }),
    deal({ id: 'a', NomEvent: 'Àpat', DataInici: '2026-08-01', HoraInici: '10:00' }),
    deal({ id: 'c', NomEvent: 'Casament', DataInici: '2026-08-01', HoraInici: '10:00' }),
    deal({ id: 'x', NomEvent: 'Altres', DataInici: '2026-08-02', HoraInici: '09:00' }),
  ]

  const result = dealsForDay(deals, '2026-08-01')
  assert.deepEqual(
    result.map((d) => d.id),
    ['a', 'c', 'b']
  )
})
