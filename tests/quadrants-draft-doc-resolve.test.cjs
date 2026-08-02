const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildCuinaDayDocId,
  parseDraftDocIdDate,
  resolveGroupedDraftTargetDocId,
} = require('../src/lib/quadrantsDraftDocResolve')

test('parseDraftDocIdDate reads YYYY-MM-DD from compound quadrant ids', () => {
  assert.equal(parseDraftDocIdDate('E123__event__2026-08-01__event'), '2026-08-01')
  assert.equal(parseDraftDocIdDate('E123'), '')
})

test('resolveGroupedDraftTargetDocId keeps concrete compound source ids', () => {
  assert.equal(
    resolveGroupedDraftTargetDocId({
      sourceDocId: 'E123__event__2026-08-01__event',
      canonicalEventId: 'E123',
      startDate: '2026-08-02',
      existingDocs: [],
    }),
    'E123__event__2026-08-01__event'
  )
})

test('resolveGroupedDraftTargetDocId maps drafts-list canonical id to the matching day doc', () => {
  const target = resolveGroupedDraftTargetDocId({
    sourceDocId: 'E123',
    canonicalEventId: 'E123',
    startDate: '2026-08-01',
    existingDocs: [
      {
        id: 'E123__event__2026-08-01__event',
        phaseDate: '2026-08-01',
        startDate: '2026-08-01',
      },
      {
        id: 'E123__event__2026-08-02__event',
        phaseDate: '2026-08-02',
        startDate: '2026-08-02',
      },
    ],
  })

  assert.equal(target, 'E123__event__2026-08-01__event')
})

test('resolveGroupedDraftTargetDocId does not fall back to a sibling day doc', () => {
  const target = resolveGroupedDraftTargetDocId({
    sourceDocId: 'E123',
    canonicalEventId: 'E123',
    startDate: '2026-08-01',
    existingDocs: [
      {
        id: 'E123__event__2026-08-02__event',
        phaseDate: '2026-08-02',
        startDate: '2026-08-02',
      },
    ],
  })

  assert.equal(target, buildCuinaDayDocId('E123', '2026-08-01'))
  assert.notEqual(target, 'E123__event__2026-08-02__event')
  assert.notEqual(target, 'E123')
})

test('resolveGroupedDraftTargetDocId preserves legacy bare canonical docs', () => {
  assert.equal(
    resolveGroupedDraftTargetDocId({
      sourceDocId: 'E123',
      canonicalEventId: 'E123',
      startDate: '2026-08-01',
      existingDocs: [{ id: 'E123', startDate: '2026-08-01' }],
    }),
    'E123'
  )
})
