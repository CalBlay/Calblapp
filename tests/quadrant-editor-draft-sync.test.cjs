const assert = require('node:assert/strict')
const { test } = require('node:test')

const { editorDraftSyncStamp } = require('../src/lib/quadrantsDraftEditor')

test('equivalent SWR draft objects keep the same editor sync stamp', () => {
  const first = { id: 'draft-1', startDate: '2026-10-19', updatedAt: '2026-10-22T10:00:00Z' }
  const refreshed = { ...first }

  assert.notEqual(first, refreshed)
  assert.equal(editorDraftSyncStamp(first), editorDraftSyncStamp(refreshed))
})

test('a real draft version change produces a new editor sync stamp', () => {
  const first = { id: 'draft-1', startDate: '2026-10-19', updatedAt: 1000 }
  const updated = { ...first, updatedAt: 2000 }

  assert.notEqual(editorDraftSyncStamp(first), editorDraftSyncStamp(updated))
})

test('Firestore-like timestamps are normalized by value, not object identity', () => {
  const timestamp = () => ({ toDate: () => new Date('2026-10-22T10:00:00Z') })
  const first = { id: 'draft-1', startDate: '2026-10-19', updatedAt: timestamp() }
  const refreshed = { ...first, updatedAt: timestamp() }

  assert.equal(editorDraftSyncStamp(first), editorDraftSyncStamp(refreshed))
})
