const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parsePendingAssignacionsRowId,
  parseConductorSlotIndex,
} = require('../src/lib/transportAssignacionsRowSlot')

test('parsePendingAssignacionsRowId reads index after the last colon', () => {
  assert.deepEqual(parsePendingAssignacionsRowId('pending:quad:abc:2'), {
    quadrantDocId: 'quad:abc',
    conductorIndex: 2,
  })
  assert.deepEqual(parsePendingAssignacionsRowId('pending:simpleDoc:0'), {
    quadrantDocId: 'simpleDoc',
    conductorIndex: 0,
  })
})

test('parsePendingAssignacionsRowId rejects malformed pending ids', () => {
  assert.equal(parsePendingAssignacionsRowId(null), null)
  assert.equal(parsePendingAssignacionsRowId(''), null)
  assert.equal(parsePendingAssignacionsRowId('row-1'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:onlydoc'), null)
  assert.equal(parsePendingAssignacionsRowId('pending::1'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:doc:-1'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:doc:1.5'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:doc:abc'), null)
})

test('parseConductorSlotIndex accepts non-negative integers only', () => {
  assert.equal(parseConductorSlotIndex(0), 0)
  assert.equal(parseConductorSlotIndex(3), 3)
  assert.equal(parseConductorSlotIndex('12'), 12)
  assert.equal(parseConductorSlotIndex(-1), null)
  assert.equal(parseConductorSlotIndex(1.2), null)
  assert.equal(parseConductorSlotIndex('01'), 1)
  assert.equal(parseConductorSlotIndex('1e2'), null)
  assert.equal(parseConductorSlotIndex(null), null)
  assert.equal(parseConductorSlotIndex(undefined), null)
})
