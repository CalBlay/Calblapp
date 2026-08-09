const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  EVENTS_COMANDA_PREPARE_PERM,
  EVENTS_WAREHOUSE_COMANDA_ONLY_PERM,
  hasEventComandaPrepareAction,
  canCreateEventComanda,
  canPrepareEventComanda,
  isEventsComandaPreparerOnlyView,
} = require('../src/lib/eventComandaPermissions')

test('hasEventComandaPrepareAction accepts prepare or legacy warehouse-only keys', () => {
  assert.equal(hasEventComandaPrepareAction((key) => key === EVENTS_COMANDA_PREPARE_PERM), true)
  assert.equal(
    hasEventComandaPrepareAction((key) => key === EVENTS_WAREHOUSE_COMANDA_ONLY_PERM),
    true
  )
  assert.equal(hasEventComandaPrepareAction(() => false), false)
})

test('canCreateEventComanda allows admin/direccio, explicit create, or events editors', () => {
  assert.equal(
    canCreateEventComanda({
      hasCreateComandaAction: false,
      isAdminOrDireccio: true,
      canEditEvents: false,
    }),
    true
  )
  assert.equal(
    canCreateEventComanda({
      hasCreateComandaAction: true,
      isAdminOrDireccio: false,
      canEditEvents: false,
    }),
    true
  )
  assert.equal(
    canCreateEventComanda({
      hasCreateComandaAction: false,
      isAdminOrDireccio: false,
      canEditEvents: true,
    }),
    true
  )
  assert.equal(
    canCreateEventComanda({
      hasCreateComandaAction: false,
      isAdminOrDireccio: false,
      canEditEvents: false,
    }),
    false
  )
})

test('canPrepareEventComanda allows admin/direccio or prepare action', () => {
  assert.equal(
    canPrepareEventComanda({ hasPrepareComandaAction: false, isAdminOrDireccio: true }),
    true
  )
  assert.equal(
    canPrepareEventComanda({ hasPrepareComandaAction: true, isAdminOrDireccio: false }),
    true
  )
  assert.equal(
    canPrepareEventComanda({ hasPrepareComandaAction: false, isAdminOrDireccio: false }),
    false
  )
})

test('isEventsComandaPreparerOnlyView is prepare-without-create for non-admins', () => {
  assert.equal(
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction: true,
      hasCreateComandaAction: false,
      isAdminOrDireccio: false,
      canEditEvents: false,
    }),
    true
  )
  assert.equal(
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction: true,
      hasCreateComandaAction: true,
      isAdminOrDireccio: false,
      canEditEvents: false,
    }),
    false
  )
  assert.equal(
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction: true,
      hasCreateComandaAction: false,
      isAdminOrDireccio: true,
      canEditEvents: false,
    }),
    false
  )
  assert.equal(
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction: false,
      hasCreateComandaAction: false,
      isAdminOrDireccio: false,
      canEditEvents: false,
    }),
    false
  )
  // Events editors can create, so they are not preparer-only even with prepare action.
  assert.equal(
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction: true,
      hasCreateComandaAction: false,
      isAdminOrDireccio: false,
      canEditEvents: true,
    }),
    false
  )
})
