const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parsePendingAssignacionsRowId,
  parseConductorSlotIndex,
} = require('../src/lib/transportAssignacionsRowSlot')

test('parsePendingAssignacionsRowId splits pending:docId:index and keeps colons in the doc id', () => {
  assert.deepEqual(parsePendingAssignacionsRowId('pending:qid-1:0'), {
    quadrantDocId: 'qid-1',
    conductorIndex: 0,
  })
  assert.deepEqual(parsePendingAssignacionsRowId('pending:evt:2026-08-22:day:3'), {
    quadrantDocId: 'evt:2026-08-22:day',
    conductorIndex: 3,
  })
})

test('parsePendingAssignacionsRowId rejects missing prefix, empty doc id, or non-integer index', () => {
  assert.equal(parsePendingAssignacionsRowId(null), null)
  assert.equal(parsePendingAssignacionsRowId(''), null)
  assert.equal(parsePendingAssignacionsRowId('qid-1:0'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:qid-1'), null)
  assert.equal(parsePendingAssignacionsRowId('pending::0'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:   :1'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:qid-1:-1'), null)
  assert.equal(parsePendingAssignacionsRowId('pending:qid-1:abc'), null)
})

test('parseConductorSlotIndex accepts non-negative integers and digit strings', () => {
  assert.equal(parseConductorSlotIndex(0), 0)
  assert.equal(parseConductorSlotIndex(4), 4)
  assert.equal(parseConductorSlotIndex('12'), 12)
  assert.equal(parseConductorSlotIndex('00'), 0)
  assert.equal(parseConductorSlotIndex('01'), 1)

  assert.equal(parseConductorSlotIndex(-1), null)
  assert.equal(parseConductorSlotIndex(1.5), null)
  assert.equal(parseConductorSlotIndex('-1'), null)
  assert.equal(parseConductorSlotIndex('1.5'), null)
  assert.equal(parseConductorSlotIndex(''), null)
  assert.equal(parseConductorSlotIndex(null), null)
  assert.equal(parseConductorSlotIndex(undefined), null)
})
