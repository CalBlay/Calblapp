const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  requestReferenceFromDocId,
  robaRequestDocIdFromInput,
  deliveryRecordReferenceFromDocId,
} = require('../src/lib/roba-personal/dotacioReferenceCodes')
const {
  linesFromRequestSnapshot,
} = require('../src/lib/roba-personal/requestLinesFromFirestore')

test('robaRequestDocIdFromInput strips an S- prefix but keeps other refs intact', () => {
  assert.equal(robaRequestDocIdFromInput('S-abc123'), 'abc123')
  assert.equal(robaRequestDocIdFromInput('s-ABC'), 'ABC')
  assert.equal(robaRequestDocIdFromInput('  S- xyz  '), 'xyz')
  assert.equal(robaRequestDocIdFromInput('abc123'), 'abc123')
  assert.equal(robaRequestDocIdFromInput('E-abc123'), 'E-abc123')
  assert.equal(robaRequestDocIdFromInput('S-'), 'S-')
  assert.equal(robaRequestDocIdFromInput(''), '')
  assert.equal(robaRequestDocIdFromInput('   '), '')
})

test('reference helpers prefix request and delivery document ids', () => {
  assert.equal(requestReferenceFromDocId('abc'), 'S-abc')
  assert.equal(deliveryRecordReferenceFromDocId('del-1'), 'E-del-1')
})

test('linesFromRequestSnapshot drops empty products and non-positive qty', () => {
  assert.deepEqual(linesFromRequestSnapshot({}), [])
  assert.deepEqual(
    linesFromRequestSnapshot({
      lines: [
        { productId: 'p1', quantity: 2, notes: '  L ' },
        { productId: 'p2', quantity: 0 },
        { productId: '', quantity: 3 },
        { productId: 'p3', quantity: 'nope' },
        { productId: 'p4', quantity: 1, notes: '   ' },
      ],
    }),
    [
      { productId: 'p1', quantity: 2, notes: 'L' },
      { productId: 'p4', quantity: 1 },
    ]
  )
})
