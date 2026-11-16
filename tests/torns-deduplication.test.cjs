const assert = require('node:assert/strict')
const { test } = require('node:test')

const { dedupeTorns } = require('../src/services/tornsService')

const worker = {
  key: 'worker-1',
  id: 'worker-1',
  name: 'Digno Belliard',
  role: 'conductor',
  startTime: '15:00',
  endTime: '19:00',
  meetingPoint: 'Masia Rosas',
  department: 'serveis',
}

const base = {
  id: 'old-doc',
  code: 'E2600527',
  eventId: 'deal-123',
  eventName: 'LIWLIG - MASIA ROSAS',
  date: '2026-11-16',
  dayNote: 'Muntatge',
  phaseLabel: 'Muntatge',
  startDate: '2026-11-16',
  endDate: '2026-11-16',
  startTime: '15:00',
  endTime: '19:00',
  meetingPoint: 'Masia Rosas',
  location: 'Masia Rosas',
  department: 'serveis',
  __rawWorkers: [worker],
}

test('reopened equivalent quadrant documents produce one shift', () => {
  const result = dedupeTorns([
    base,
    { ...base, id: 'reopened-doc-1' },
    { ...base, id: 'reopened-doc-2', eventId: 'deal-123__muntatge__2026-11-16' },
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].__rawWorkers.length, 1)
  assert.equal(result[0].__rawWorkers[0].name, 'Digno Belliard')
})

test('equivalent shift documents merge different workers without duplicating them', () => {
  const secondWorker = {
    ...worker,
    key: 'worker-2',
    id: 'worker-2',
    name: 'Anna Puig',
    role: 'treballador',
  }
  const result = dedupeTorns([
    base,
    { ...base, id: 'new-doc', __rawWorkers: [worker, secondWorker] },
  ])

  assert.equal(result.length, 1)
  assert.deepEqual(
    result[0].__rawWorkers.map((item) => item.name).sort(),
    ['Anna Puig', 'Digno Belliard']
  )
})

test('different phases or schedules remain separate shifts', () => {
  const result = dedupeTorns([
    base,
    { ...base, id: 'event-doc', dayNote: 'Event', phaseLabel: 'Event' },
    { ...base, id: 'later-doc', startTime: '20:00', endTime: '23:00' },
  ])

  assert.equal(result.length, 3)
})
