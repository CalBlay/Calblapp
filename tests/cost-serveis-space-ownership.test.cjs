const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  classifySpaceKind,
  indexSpaceOwnershipDocs,
  resolveSpaceKind,
} = require('../src/lib/costServeis/spaceOwnership')

test('classifySpaceKind uses tipus, then CC* as propi', () => {
  assert.equal(classifySpaceKind('Propi', 'EXT001'), 'Propi')
  assert.equal(classifySpaceKind('Extern', 'CCH00001'), 'Extern')
  assert.equal(classifySpaceKind('pròpia', ''), 'Propi')
  assert.equal(classifySpaceKind('', 'CCH00001'), 'Propi')
  assert.equal(classifySpaceKind('', 'EXT001'), 'Extern')
})

test('resolveSpaceKind matches fincaId, code and location from Espais catalog', () => {
  const index = indexSpaceOwnershipDocs([
    {
      id: 'f1',
      data: { nom: 'Can Blay', code: 'CCH00001', tipus: 'Propi' },
    },
    {
      id: 'f2',
      data: { nom: 'Mas Extern', code: 'EXT99', tipus: 'Extern' },
    },
  ])

  assert.equal(resolveSpaceKind(index, { fincaId: 'f1' }), 'Propi')
  assert.equal(resolveSpaceKind(index, { fincaCode: 'ext99' }), 'Extern')
  assert.equal(
    resolveSpaceKind(index, { location: 'Can Blay (CCH00001)' }),
    'Propi'
  )
  assert.equal(resolveSpaceKind(index, { location: 'Mas Extern' }), 'Extern')
  assert.equal(resolveSpaceKind(index, { fincaCode: 'CCH00002' }), 'Propi')
  assert.equal(resolveSpaceKind(index, { location: '' }), null)
})
