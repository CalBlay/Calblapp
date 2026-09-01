const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parseActionPermission,
  isViewPerm,
  isEditPerm,
  isActionPerm,
  PERM,
} = require('../src/lib/permissionKeys')

test('parseActionPermission splits ui:action:/menu/...:action keys', () => {
  assert.deepEqual(parseActionPermission('ui:action:/menu/calendar:manual:create'), {
    path: '/menu/calendar',
    action: 'manual:create',
  })
  assert.deepEqual(parseActionPermission('ui:action:/menu/spaces/info:bbdd:delete'), {
    path: '/menu/spaces/info',
    action: 'bbdd:delete',
  })
  assert.deepEqual(parseActionPermission(PERM.action('/menu/quadrants', 'premisses:edit')), {
    path: '/menu/quadrants',
    action: 'premisses:edit',
  })
})

test('parseActionPermission rejects non-menu action keys and other permission kinds', () => {
  assert.equal(parseActionPermission(''), null)
  assert.equal(parseActionPermission('ui:view:/menu/calendar'), null)
  assert.equal(parseActionPermission('ui:edit:/menu/calendar'), null)
  assert.equal(parseActionPermission('ui:action:/admin/users:delete'), null)
  assert.equal(parseActionPermission('ui:action:/menu/calendar'), null)
})

test('PERM helpers classify view/edit/action prefixes', () => {
  assert.equal(isViewPerm(PERM.view('/menu/calendar')), true)
  assert.equal(isEditPerm(PERM.edit('/menu/calendar')), true)
  assert.equal(isActionPerm(PERM.action('/menu/calendar', 'manual:create')), true)
  assert.equal(isViewPerm(PERM.edit('/menu/calendar')), false)
})
