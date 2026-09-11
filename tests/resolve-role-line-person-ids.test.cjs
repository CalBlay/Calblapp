const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  resolveRoleLinesPersonIds,
} = require('../src/app/menu/quadrants/[id]/lib/resolveRoleLinePersonIds')

test('name-only lines pick a pool id even when accents differ', () => {
  const [line] = resolveRoleLinesPersonIds(
    [{ slotId: '1', role: 'treballador', personId: '', personName: 'José' }],
    [{ id: 'j1', name: 'Jose' }]
  )

  assert.equal(line.personId, 'j1')
  assert.equal(line.personName, 'Jose')
})

test('a known personId keeps its id and takes the canonical pool name', () => {
  const [line] = resolveRoleLinesPersonIds(
    [{ slotId: '1', role: 'treballador', personId: 'j1', personName: 'old' }],
    [{ id: 'j1', name: 'Jose' }]
  )

  assert.equal(line.personId, 'j1')
  assert.equal(line.personName, 'Jose')
})

test('unmatched names and empty pools leave the line unchanged', () => {
  const original = [
    { slotId: '1', role: 'treballador', personId: '', personName: 'Desconegut' },
  ]

  assert.deepEqual(
    resolveRoleLinesPersonIds(original, [{ id: 'j1', name: 'Jose' }]),
    original
  )
  assert.deepEqual(resolveRoleLinesPersonIds(original, []), original)
})
