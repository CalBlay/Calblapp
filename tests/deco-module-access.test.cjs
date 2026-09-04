const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canManageDecoTickets,
  isDecoDepartment,
  isDecoDepartmentHead,
} = require('../src/lib/decoTicketsPermissions')
const { getVisibleModules } = require('../src/lib/accessControl')

test('Deco aliases share the same module identity', () => {
  assert.equal(isDecoDepartment('Deco'), true)
  assert.equal(isDecoDepartment('Decoració'), true)
  assert.equal(isDecoDepartment('decoracions'), true)
  assert.equal(isDecoDepartment('manteniment'), false)
})

test('Deco ticket management is restricted to management roles', () => {
  assert.equal(canManageDecoTickets({ role: 'cap', department: 'Decoració' }), true)
  assert.equal(canManageDecoTickets({ role: 'treballador', department: 'Deco' }), false)
  assert.equal(canManageDecoTickets({ role: 'cap', department: 'logistica' }), false)
  assert.equal(canManageDecoTickets({ role: 'admin', department: 'logistica' }), true)
})

test('the Deco department head can be assigned as an operator', () => {
  assert.equal(isDecoDepartmentHead({ role: 'cap', department: 'Deco' }), true)
  assert.equal(isDecoDepartmentHead({ role: 'cap', department: 'Decoració' }), true)
  assert.equal(isDecoDepartmentHead({ role: 'treballador', department: 'Deco' }), false)
  assert.equal(isDecoDepartmentHead({ role: 'cap', department: 'manteniment' }), false)
})

test('Deco caps see tickets, planner and preparation; workers only see preparation', () => {
  const capModule = getVisibleModules({ role: 'cap', department: 'Decoracio' }).find(
    (module) => module.path === '/menu/deco'
  )
  const workerModule = getVisibleModules({ role: 'treballador', department: 'Decoracio' }).find(
    (module) => module.path === '/menu/deco'
  )

  assert.deepEqual(
    capModule?.submodules?.map((submodule) => submodule.path),
    ['/menu/deco/tickets', '/menu/deco/planificador', '/menu/deco/preparacio']
  )
  assert.deepEqual(
    workerModule?.submodules?.map((submodule) => submodule.path),
    ['/menu/deco/preparacio']
  )
})
