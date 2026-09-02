const assert = require('node:assert/strict')
const { test } = require('node:test')

const { buildEffectiveBaseMap, baseForPath } = require('../src/lib/permissions/effectiveBase')

test('baseForPath returns false view/edit for unknown paths', () => {
  const map = buildEffectiveBaseMap({ role: 'admin', department: 'serveis' })
  assert.deepEqual(baseForPath(map, '/menu/does-not-exist'), { view: false, edit: false })
  assert.deepEqual(baseForPath(new Map(), '/menu/events'), { view: false, edit: false })
})

test('buildEffectiveBaseMap grants events view+edit to admin and edit roles', () => {
  for (const role of ['admin', 'direccio', 'cap', 'usuari', 'comercial']) {
    const entry = baseForPath(
      buildEffectiveBaseMap({ role, department: 'empresa' }),
      '/menu/events'
    )
    assert.equal(entry.view, true, role)
    assert.equal(entry.edit, true, role)
  }
})

test('buildEffectiveBaseMap lets treballador/observer view events but never edit', () => {
  const worker = baseForPath(
    buildEffectiveBaseMap({ role: 'treballador', department: 'cuina' }),
    '/menu/events'
  )
  assert.deepEqual(worker, { view: true, edit: false })

  const observer = baseForPath(
    buildEffectiveBaseMap({ role: 'observer', department: 'empresa' }),
    '/menu/events'
  )
  assert.deepEqual(observer, { view: true, edit: false })
})

test('buildEffectiveBaseMap treats unknown roles as treballador (no edit)', () => {
  const entry = baseForPath(
    buildEffectiveBaseMap({ role: 'guest', department: 'cuina' }),
    '/menu/events'
  )
  assert.deepEqual(entry, { view: true, edit: false })
})
