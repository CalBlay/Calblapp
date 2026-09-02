const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeAssignedIds,
  rangesOverlap,
  shouldCheckMaintenanceAssigneeConflict,
} = require('../src/lib/maintenanceAssigneeConflict')

test('status-only PATCHes must not run assignee overlap checks', () => {
  // Worker journey / status updates send status fields only. If we still
  // conflict-check existing planning, overlapping tickets become stuck and
  // cannot start/finish or write workLogs.
  assert.equal(
    shouldCheckMaintenanceAssigneeConflict({
      planningTouched: false,
      planningChanged: false,
      assignedToIds: ['worker-1'],
      plannedStart: Date.parse('2026-07-27T08:00:00.000Z'),
      plannedEnd: Date.parse('2026-07-27T10:00:00.000Z'),
    }),
    false
  )
})

test('planning assignment changes still enforce overlap checks', () => {
  assert.equal(
    shouldCheckMaintenanceAssigneeConflict({
      planningTouched: true,
      planningChanged: true,
      assignedToIds: ['worker-1'],
      plannedStart: Date.parse('2026-07-27T08:00:00.000Z'),
      plannedEnd: Date.parse('2026-07-27T10:00:00.000Z'),
    }),
    true
  )
})

test('desplanified or unassigned tickets skip overlap checks', () => {
  assert.equal(
    shouldCheckMaintenanceAssigneeConflict({
      planningTouched: true,
      planningChanged: true,
      assignedToIds: [],
      plannedStart: Date.parse('2026-07-27T08:00:00.000Z'),
      plannedEnd: Date.parse('2026-07-27T10:00:00.000Z'),
    }),
    false
  )

  assert.equal(
    shouldCheckMaintenanceAssigneeConflict({
      planningTouched: true,
      planningChanged: true,
      assignedToIds: ['worker-1'],
      plannedStart: null,
      plannedEnd: Date.parse('2026-07-27T10:00:00.000Z'),
    }),
    false
  )
})

test('rangesOverlap detects true overlaps and ignores adjacent ranges', () => {
  const aStart = Date.parse('2026-07-27T08:00:00.000Z')
  const aEnd = Date.parse('2026-07-27T10:00:00.000Z')
  const overlapStart = Date.parse('2026-07-27T09:00:00.000Z')
  const overlapEnd = Date.parse('2026-07-27T11:00:00.000Z')
  const adjacentStart = Date.parse('2026-07-27T10:00:00.000Z')
  const adjacentEnd = Date.parse('2026-07-27T12:00:00.000Z')

  assert.equal(rangesOverlap(aStart, aEnd, overlapStart, overlapEnd), true)
  assert.equal(rangesOverlap(aStart, aEnd, adjacentStart, adjacentEnd), false)
  assert.equal(rangesOverlap(aStart, aEnd, null, adjacentEnd), false)
})

test('normalizeAssignedIds drops blanks', () => {
  assert.deepEqual(normalizeAssignedIds([' a ', '', null, 'b']), ['a', 'b'])
  assert.deepEqual(normalizeAssignedIds(undefined), [])
})
