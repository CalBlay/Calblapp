const assert = require('node:assert/strict')
const { test } = require('node:test')

const { buildUiViewMap } = require('../src/lib/permissions/buildUiViewMap')
const { PERM } = require('../src/lib/permissionKeys')

function view(path, effect) {
  return { permission: PERM.view(path), effect, scope: 'client', scopeId: null }
}

test('parent deny hides the module and every submodule', () => {
  const map = buildUiViewMap(
    { role: 'cap', department: 'logistica' },
    { overrides: [view('/menu/logistica', 'deny')] }
  )

  assert.equal(map['/menu/logistica'], false)
  assert.equal(map['/menu/logistica/preparacio'], false)
  assert.equal(map['/menu/logistica/assignacions'], false)
  assert.equal(map['/menu/logistica/transports'], false)
})

test('parent allow inherits to children except an explicit child deny', () => {
  const map = buildUiViewMap(
    { role: 'treballador', department: 'serveis' },
    {
      overrides: [
        view('/menu/incidents', 'allow'),
        view('/menu/incidents/tipologies', 'deny'),
      ],
    }
  )

  assert.equal(map['/menu/incidents'], true)
  assert.equal(map['/menu/incidents/accions'], true)
  assert.equal(map['/menu/incidents/quadre'], true)
  assert.equal(map['/menu/incidents/tipologies'], false)
})

test('manteniment parent allow does not open children; empty children hide the parent', () => {
  const parentOnly = buildUiViewMap(
    { role: 'cap', department: 'cuina' },
    { overrides: [view('/menu/manteniment', 'allow')] }
  )
  assert.equal(parentOnly['/menu/manteniment'], false)
  assert.equal(parentOnly['/menu/manteniment/tickets'], false)
  assert.equal(parentOnly['/menu/manteniment/preventius'], false)

  const withTickets = buildUiViewMap(
    { role: 'cap', department: 'cuina' },
    {
      overrides: [
        view('/menu/manteniment', 'allow'),
        view('/menu/manteniment/tickets', 'allow'),
      ],
    }
  )
  assert.equal(withTickets['/menu/manteniment'], true)
  assert.equal(withTickets['/menu/manteniment/tickets'], true)
  assert.equal(withTickets['/menu/manteniment/preventius'], false)
})

test('roba-personal stays hidden on an assignment unless a path is explicitly allowed', () => {
  const rrhhCap = { role: 'cap', department: 'recursos humans' }

  const withoutAssignment = buildUiViewMap(rrhhCap, null)
  assert.equal(withoutAssignment['/menu/roba-personal'], true)

  const emptyAssignment = buildUiViewMap(rrhhCap, { overrides: [] })
  assert.equal(emptyAssignment['/menu/roba-personal'], false)

  const explicit = buildUiViewMap(rrhhCap, {
    overrides: [view('/menu/roba-personal', 'allow')],
  })
  assert.equal(explicit['/menu/roba-personal'], true)
})
