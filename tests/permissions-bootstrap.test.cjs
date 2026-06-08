const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildBootstrapAssignmentUpdate,
} = require('../src/lib/permissions/bootstrapAssignments')

const UPDATED_AT = '2026-06-06T11:00:00.000Z'
const UPDATED_BY = 'admin-1'

test('permission bootstrap update normalizes base role and department fields', () => {
  assert.deepEqual(
    buildBootstrapAssignmentUpdate(
      { id: ' user-1 ', role: 'Direcció', department: ' Logística ' },
      UPDATED_BY,
      UPDATED_AT
    ),
    {
      userId: 'user-1',
      base: {
        role: 'direccio',
        department: 'Logística',
      },
      updatedAt: UPDATED_AT,
      updatedBy: UPDATED_BY,
    }
  )
})

test('permission bootstrap update safely falls back for unknown roles and blank departments', () => {
  assert.deepEqual(
    buildBootstrapAssignmentUpdate(
      { id: 'user-2', role: 'unknown-role', department: '   ' },
      UPDATED_BY,
      UPDATED_AT
    ),
    {
      userId: 'user-2',
      base: {
        role: 'treballador',
        department: null,
      },
      updatedAt: UPDATED_AT,
      updatedBy: UPDATED_BY,
    }
  )
})

test('permission bootstrap update skips blank ids and preserves override-bearing fields', () => {
  assert.equal(
    buildBootstrapAssignmentUpdate({ id: '   ', role: 'cap' }, UPDATED_BY, UPDATED_AT),
    null
  )

  const update = buildBootstrapAssignmentUpdate(
    { id: 'user-3', role: 'cap', department: 'manteniment' },
    UPDATED_BY,
    UPDATED_AT
  )

  assert.ok(update)
  assert.equal(Object.hasOwn(update, 'overrides'), false)
  assert.equal(Object.hasOwn(update, 'permissionSets'), false)
})
