const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') {
    return {}
  }
  if (isFirebaseAdminModule(request)) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  normalizeEventDay,
  buildEventExtrasDocId,
  normalizeLnKey,
  isWeddingLn,
  sanitizeExtraEntries,
} = require('../src/lib/eventExtras')

test('normalizeEventDay accepts only YYYY-MM-DD values', () => {
  assert.equal(normalizeEventDay('2026-07-20'), '2026-07-20')
  assert.equal(normalizeEventDay(' 2026-07-20 '), '2026-07-20')
  assert.equal(normalizeEventDay('20/07/2026'), '')
  assert.equal(normalizeEventDay(''), '')
  assert.equal(normalizeEventDay(null), '')
})

test('buildEventExtrasDocId appends day when present and falls back to event id', () => {
  assert.equal(buildEventExtrasDocId('evt-1', '2026-07-20'), 'evt-1_2026-07-20')
  assert.equal(buildEventExtrasDocId('evt-1', 'bad-day'), 'evt-1')
  assert.equal(buildEventExtrasDocId('  evt-2  ', null), 'evt-2')
})

test('normalizeLnKey maps known lines and defaults to altres', () => {
  assert.equal(normalizeLnKey('Casaments'), 'casaments')
  assert.equal(normalizeLnKey('EMPRESA'), 'empresa')
  assert.equal(normalizeLnKey('FoodLovers'), 'foodlovers')
  assert.equal(normalizeLnKey('Agenda'), 'agenda')
  assert.equal(normalizeLnKey('Restauració'), 'altres')
  assert.equal(isWeddingLn('  casaments '), true)
  assert.equal(isWeddingLn('empresa'), false)
})

test('sanitizeExtraEntries accepts arrays, newline strings, and object text fields', () => {
  assert.deepEqual(
    sanitizeExtraEntries(['  Extra A  ', '', { text: 'Extra B' }, { text: '   ' }, 12]),
    [{ text: 'Extra A' }, { text: 'Extra B' }]
  )
  assert.deepEqual(sanitizeExtraEntries('Linia 1\n\nLinia 2\r\n  '), [
    { text: 'Linia 1' },
    { text: 'Linia 2' },
  ])
  assert.deepEqual(sanitizeExtraEntries(null), [])
  assert.deepEqual(sanitizeExtraEntries({ text: 'nope' }), [])
})
