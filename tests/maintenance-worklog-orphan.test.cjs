const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  applyWorkLogUpdate,
  computeWorkLogMinutes,
} = require('../src/lib/maintenanceWorkLogs')

test('open en_curs work logs are ignored until closed — planner reset would drop minutes', () => {
  const openLogs = [
    {
      at: Date.parse('2026-07-23T08:00:00.000Z'),
      startTime: '09:00',
      endTime: null,
      byId: 'worker-1',
      byName: 'Worker',
      sourceStatus: 'en_curs',
    },
  ]

  assert.equal(computeWorkLogMinutes(openLogs), 0)

  // Simulates a later worker resume after a bad planner auto-reset to assignat:
  // a new open segment is opened without closing the original one.
  const afterResume = applyWorkLogUpdate(openLogs, 'assignat', 'en_curs', {
    at: Date.parse('2026-07-23T11:00:00.000Z'),
    newSegmentStartTime: '11:00',
    userId: 'worker-1',
    userName: 'Worker',
  })
  assert.equal(afterResume.length, 2)
  assert.equal(computeWorkLogMinutes(afterResume), 0)

  const afterFinish = applyWorkLogUpdate(afterResume, 'en_curs', 'fet', {
    at: Date.parse('2026-07-23T12:00:00.000Z'),
    closeSegmentEndTime: '12:00',
    userId: 'worker-1',
    userName: 'Worker',
  })

  // Only the newest open segment closes; the original 09:00 segment stays open
  // and its minutes never count.
  assert.equal(computeWorkLogMinutes(afterFinish), 60)
  assert.equal(String(afterFinish[0].endTime || ''), '')
  assert.equal(afterFinish[1].endTime, '12:00')
})

test('closing en_curs with an end time preserves worked minutes', () => {
  const openLogs = [
    {
      at: Date.parse('2026-07-23T08:00:00.000Z'),
      startTime: '09:00',
      endTime: null,
      byId: 'worker-1',
      byName: 'Worker',
      sourceStatus: 'en_curs',
    },
  ]

  const closed = applyWorkLogUpdate(openLogs, 'en_curs', 'espera', {
    at: Date.parse('2026-07-23T10:00:00.000Z'),
    closeSegmentEndTime: '10:00',
    userId: 'worker-1',
    userName: 'Worker',
  })

  assert.equal(computeWorkLogMinutes(closed), 60)
})
