const test = require('node:test')
const assert = require('node:assert/strict')

const {
  canEnableEventClosingAction,
  canOpenEventClosing,
  canCloseEventDepartment,
} = require('../src/lib/eventClosingPermissions')

test('event closing requires events view, edit, and its explicit permission', () => {
  assert.equal(
    canEnableEventClosingAction({
      canViewEvents: true,
      canEditEvents: true,
      hasClosingOverride: true,
    }),
    true
  )
  assert.equal(
    canEnableEventClosingAction({
      canViewEvents: true,
      canEditEvents: false,
      hasClosingOverride: true,
    }),
    false
  )
  assert.equal(
    canEnableEventClosingAction({
      canViewEvents: true,
      canEditEvents: true,
      hasClosingOverride: false,
    }),
    false
  )
})

test('workers and commercials can open closing only with the explicit permission', () => {
  assert.equal(canOpenEventClosing({ role: 'treballador', hasClosingPermission: true }), true)
  assert.equal(canOpenEventClosing({ role: 'comercial', hasClosingPermission: true }), true)
  assert.equal(canOpenEventClosing({ role: 'treballador', hasClosingPermission: false }), false)
  assert.equal(canOpenEventClosing({ role: 'usuari', hasClosingPermission: true }), false)
})

test('workers and commercials close only their department; managers can switch', () => {
  assert.equal(
    canCloseEventDepartment({
      role: 'treballador',
      userDepartment: 'Food Lover',
      targetDepartment: 'foodlovers',
      hasClosingPermission: true,
    }),
    true
  )
  assert.equal(
    canCloseEventDepartment({
      role: 'treballador',
      userDepartment: 'Food Lover',
      targetDepartment: 'serveis',
      hasClosingPermission: true,
    }),
    false
  )
  assert.equal(
    canCloseEventDepartment({
      role: 'cap',
      userDepartment: 'logistica',
      targetDepartment: 'serveis',
      hasClosingPermission: true,
    }),
    true
  )
})
