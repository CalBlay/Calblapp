const assert = require('node:assert/strict')
const { test } = require('node:test')

const { serializeFirestoreDoc } = require('../src/lib/roba-personal/serialize')

test('serializeFirestoreDoc prefers the document id over a payload id field', () => {
  const out = serializeFirestoreDoc('req-real', {
    id: '',
    status: 'submitted',
    qty: 2,
  })
  assert.equal(out.id, 'req-real')
  assert.equal(out.status, 'submitted')
  assert.equal(out.qty, 2)
})

test('serializeFirestoreDoc converts Timestamp-like values to ISO and leaves other fields', () => {
  const created = {
    toDate: () => new Date('2026-08-25T10:00:00.000Z'),
  }
  const nested = { keep: true }
  const out = serializeFirestoreDoc('doc-1', {
    id: 'stale-id',
    createdAt: created,
    notes: null,
    nested,
    label: 'ok',
  })

  assert.equal(out.id, 'doc-1')
  assert.equal(out.createdAt, '2026-08-25T10:00:00.000Z')
  assert.equal(out.notes, null)
  assert.equal(out.nested, nested)
  assert.equal(out.label, 'ok')
})
