const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  groupQuadrantsByDayAndEvent,
  groupQuadrantsByDay,
} = require('../src/lib/quadrantsGrouping')

function row(overrides = {}) {
  return {
    id: 'row',
    summary: 'Casament',
    start: '2026-08-01T10:00:00.000Z',
    end: '2026-08-01T18:00:00.000Z',
    eventId: 'E123',
    code: 'E123',
    numPax: 80,
    displayStartTime: '10:00',
    ...overrides,
  }
}

test('groupQuadrantsByDayAndEvent nests phases under day + eventId', () => {
  const grouped = groupQuadrantsByDayAndEvent([
    row({
      id: 'muntatge',
      phaseKey: 'muntatge',
      displayStartTime: '08:00',
      start: '2026-08-01T08:00:00.000Z',
      numPax: 80,
    }),
    row({
      id: 'event',
      phaseKey: 'event',
      displayStartTime: '10:00',
      numPax: 80,
    }),
    row({
      id: 'other-day',
      eventId: 'E123',
      start: '2026-08-02T10:00:00.000Z',
      displayStartTime: '10:00',
      numPax: 80,
    }),
    row({
      id: 'other-event',
      eventId: 'E999',
      code: 'E999',
      summary: 'Empresa',
      displayStartTime: '09:00',
      numPax: 40,
    }),
  ])

  assert.equal(grouped.length, 2)
  assert.equal(grouped[0].day, '2026-08-01')
  assert.equal(grouped[0].events.length, 2)
  assert.equal(grouped[0].totalPax, 120)

  const e123 = grouped[0].events.find((e) => e.eventId === 'E123')
  assert.ok(e123)
  assert.deepEqual(
    e123.phases.map((p) => p.phaseKey),
    ['muntatge', 'event']
  )

  assert.equal(grouped[1].day, '2026-08-02')
  assert.equal(grouped[1].events[0].phases.length, 1)
})

test('groupQuadrantsByDayAndEvent skips rows without day or event identity', () => {
  const grouped = groupQuadrantsByDayAndEvent([
    row({ start: '', eventId: 'E1' }),
    row({ eventId: '', code: '', id: '' }),
    row({ eventId: 'E2', numPax: 10 }),
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].events[0].eventId, 'E2')
  assert.equal(grouped[0].totalPax, 10)
})

test('groupQuadrantsByDay keeps one flat list per day sorted by date', () => {
  const grouped = groupQuadrantsByDay([
    row({ start: '2026-08-02T10:00:00.000Z', id: 'b' }),
    row({ start: '2026-08-01T10:00:00.000Z', id: 'a' }),
    row({ start: '2026-08-01T12:00:00.000Z', id: 'c' }),
  ])

  assert.deepEqual(
    grouped.map(([day, rows]) => [day, rows.map((r) => r.id)]),
    [
      ['2026-08-01', ['a', 'c']],
      ['2026-08-02', ['b']],
    ]
  )
})
