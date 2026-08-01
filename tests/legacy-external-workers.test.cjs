const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  readLegacyExternalWorkersFromDoc,
  expandLegacyExternalWorkers,
} = require('../src/lib/legacyExternalWorkers')

test('readLegacyExternalWorkersFromDoc reads compacted brigades field and rejects bad docs', () => {
  assert.deepEqual(readLegacyExternalWorkersFromDoc(null), [])
  assert.deepEqual(readLegacyExternalWorkersFromDoc('x'), [])
  assert.deepEqual(readLegacyExternalWorkersFromDoc({}), [])
  assert.deepEqual(readLegacyExternalWorkersFromDoc({ brigades: 'nope' }), [])

  const rows = readLegacyExternalWorkersFromDoc({
    brigades: [{ name: 'ETT Gades', workers: 2 }],
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'ETT Gades')
  assert.equal(rows[0].workers, 2)
})

test('expandLegacyExternalWorkers expands worker counts and defaults empty names to ETT', () => {
  const expanded = expandLegacyExternalWorkers([
    {
      name: 'ETT Alpha',
      workers: 3,
      meetingPoint: 'Porta',
      startDate: '2026-07-28',
      startTime: '09:00',
      endDate: '2026-07-28',
      endTime: '17:00',
      arrivalTime: '08:45',
    },
    { name: '   ', workers: 0 },
  ])

  assert.equal(expanded.length, 4)
  assert.equal(expanded.filter((row) => row.name === 'ETT Alpha').length, 3)
  assert.equal(expanded[0].isExternal, true)
  assert.equal(expanded[0].meetingPoint, 'Porta')
  assert.equal(expanded[0].startTime, '09:00')
  assert.equal(expanded[0].id, '')
  assert.equal(expanded[3].name, 'ETT')
})
