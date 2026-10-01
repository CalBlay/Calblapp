const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parseBulkPermissionOperation,
} = require('../src/lib/permissions/bulkPermissionUpdate')
const { PERMISSION_ACTION_GROUPS } = require('../src/lib/permissions/matrixConfig')

test('bulk module access maps none, view, edit and base to both overrides', () => {
  assert.deepEqual(
    parseBulkPermissionOperation({ kind: 'access', path: '/menu/calendar', level: 'view' }),
    [
      { permission: 'ui:view:/menu/calendar', effect: 'allow' },
      { permission: 'ui:edit:/menu/calendar', effect: 'deny' },
    ]
  )
  assert.deepEqual(
    parseBulkPermissionOperation({ kind: 'access', path: '/menu/calendar', level: 'base' }),
    [
      { permission: 'ui:view:/menu/calendar', effect: null },
      { permission: 'ui:edit:/menu/calendar', effect: null },
    ]
  )
  assert.deepEqual(
    parseBulkPermissionOperation({ kind: 'access', path: '/menu/calendar', level: 'edit' }),
    [
      { permission: 'ui:view:/menu/calendar', effect: 'allow' },
      { permission: 'ui:edit:/menu/calendar', effect: 'allow' },
    ]
  )
  assert.deepEqual(
    parseBulkPermissionOperation({ kind: 'access', path: '/menu/calendar', level: 'none' }),
    [
      { permission: 'ui:view:/menu/calendar', effect: 'deny' },
      { permission: 'ui:edit:/menu/calendar', effect: 'deny' },
    ]
  )
})

test('bulk action only accepts catalogued permissions and supports reset to base', () => {
  const action = PERMISSION_ACTION_GROUPS[0].actions[0]
  assert.deepEqual(
    parseBulkPermissionOperation({ kind: 'action', permission: action.key, effect: 'allow' }),
    [{ permission: action.key, effect: 'allow' }]
  )
  assert.deepEqual(
    parseBulkPermissionOperation({ kind: 'action', permission: action.key, effect: 'base' }),
    [{ permission: action.key, effect: null }]
  )
  assert.equal(
    parseBulkPermissionOperation({ kind: 'action', permission: 'action:invented', effect: 'allow' }),
    null
  )
})

test('bulk operations reject unknown paths and values', () => {
  assert.equal(
    parseBulkPermissionOperation({ kind: 'access', path: '/menu/invented', level: 'edit' }),
    null
  )
  assert.equal(
    parseBulkPermissionOperation({ kind: 'access', path: '/menu/calendar', level: 'owner' }),
    null
  )
  assert.equal(parseBulkPermissionOperation(null), null)
})
