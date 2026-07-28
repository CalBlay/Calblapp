const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildServeisPhaseDocId,
  docMatchesServeisPhaseScope,
  resolveServeisPhaseScope,
} = require('../src/lib/quadrantsServeisPhaseScope')

test('resolveServeisPhaseScope defaults to event and prefers label for doc ids', () => {
  assert.deepEqual(resolveServeisPhaseScope(null), {
    phaseKey: 'event',
    phaseTokens: ['event'],
    phaseDate: '',
  })

  const muntatge = resolveServeisPhaseScope({
    phaseType: 'muntatge',
    phaseLabel: 'Muntatge',
    startDate: '2026-08-01',
  })
  assert.equal(muntatge.phaseKey, 'muntatge')
  assert.ok(muntatge.phaseTokens.includes('muntatge'))
  assert.equal(muntatge.phaseDate, '2026-08-01')
})

test('docMatchesServeisPhaseScope keeps other phases/dates out of event saves', () => {
  const eventScope = resolveServeisPhaseScope({
    phaseType: 'event',
    startDate: '2026-08-01',
  })

  assert.equal(
    docMatchesServeisPhaseScope(
      'E123__event__2026-08-01__group-1',
      { phaseType: 'event', startDate: '2026-08-01' },
      eventScope
    ),
    true
  )

  assert.equal(
    docMatchesServeisPhaseScope(
      'E123__muntatge__2026-08-01__group-1',
      { phaseType: 'muntatge', startDate: '2026-08-01' },
      eventScope
    ),
    false,
    'saving event must not touch muntatge docs'
  )

  assert.equal(
    docMatchesServeisPhaseScope(
      'E123__event__2026-08-02__group-1',
      { phaseType: 'event', startDate: '2026-08-02' },
      eventScope
    ),
    false,
    'saving day 1 must not touch day 2 event docs'
  )

  assert.equal(
    docMatchesServeisPhaseScope('E123', { startDate: '2026-08-01' }, eventScope),
    true,
    'legacy docs without phase markers count as event'
  )
})

test('buildServeisPhaseDocId uses phase key instead of hardcoding event', () => {
  assert.equal(
    buildServeisPhaseDocId({
      canonicalEventId: 'E123',
      phaseKey: 'muntatge',
      phaseDate: '2026-08-01',
      groupId: 'group-1',
    }),
    'E123__muntatge__2026-08-01__group-1'
  )
})
