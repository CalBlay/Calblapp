const assert = require('node:assert/strict')
const { test } = require('node:test')

const { resolveEventDisplayName } = require('../src/lib/eventDisplayName')

test('resolveEventDisplayName prefers NomEvent then common Firestore aliases', () => {
  assert.equal(
    resolveEventDisplayName({
      NomEvent: '  NomEvent  ',
      eventName: 'eventName',
      summary: 'summary',
      Nom: 'Nom',
      name: 'name',
      title: 'title',
    }),
    'NomEvent'
  )
  assert.equal(resolveEventDisplayName({ eventName: '  E  ', summary: 'S' }), 'E')
  assert.equal(resolveEventDisplayName({ summary: 'S', Nom: 'N' }), 'S')
  assert.equal(resolveEventDisplayName({ Nom: 'N', name: 'n' }), 'N')
  assert.equal(resolveEventDisplayName({ name: 'n', title: 't' }), 'n')
  assert.equal(resolveEventDisplayName({ title: '  t  ' }), 't')
})

test('resolveEventDisplayName skips blank data fields and uses ordered fallbacks', () => {
  assert.equal(resolveEventDisplayName({ NomEvent: '   ', title: '' }, 'fb1', 'fb2'), 'fb1')
  assert.equal(resolveEventDisplayName(null, '  ', 'fallback'), 'fallback')
  assert.equal(resolveEventDisplayName(undefined, null, undefined, 'last'), 'last')
  assert.equal(resolveEventDisplayName({}), '')
})
