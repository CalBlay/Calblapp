const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  PREPARATION_IMPORT_PERM,
  resolvePreparationImportUiAction,
} = require('../src/lib/logistics/preparationPermissions')

test('PREPARATION_IMPORT_PERM is the expected ui action key', () => {
  assert.equal(
    PREPARATION_IMPORT_PERM,
    'ui:action:/menu/logistica/preparacio:services:import'
  )
})

test('resolvePreparationImportUiAction grants managers by default', () => {
  for (const role of ['admin', 'direccio', 'cap', 'Direccio', 'CAP']) {
    assert.equal(
      resolvePreparationImportUiAction({ canViewPreparation: true, role }),
      true,
      role
    )
  }
})

test('resolvePreparationImportUiAction denies workers and users without view', () => {
  assert.equal(
    resolvePreparationImportUiAction({ canViewPreparation: true, role: 'treballador' }),
    false
  )
  assert.equal(
    resolvePreparationImportUiAction({ canViewPreparation: false, role: 'admin' }),
    false
  )
})

test('resolvePreparationImportUiAction honors explicit allow/deny overrides', () => {
  assert.equal(
    resolvePreparationImportUiAction({
      canViewPreparation: true,
      role: 'treballador',
      overrideEffect: 'allow',
    }),
    true
  )
  assert.equal(
    resolvePreparationImportUiAction({
      canViewPreparation: true,
      role: 'cap',
      overrideEffect: 'deny',
    }),
    false
  )
})
