const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  PERMISSION_ACTION_GROUPS,
  shouldShowActionGroup,
  actionGroupDefaultExpanded,
} = require('../src/lib/permissions/matrixConfig')

test('shouldShowActionGroup requires view+edit unless the group is view-only', () => {
  assert.equal(shouldShowActionGroup(true, true, false), true)
  assert.equal(shouldShowActionGroup(true, false, false), false)
  assert.equal(shouldShowActionGroup(false, true, false), false)
  assert.equal(shouldShowActionGroup(true, false, true), true)
  assert.equal(shouldShowActionGroup(false, true, true), false)
  assert.equal(shouldShowActionGroup(true, true), true)
  assert.equal(shouldShowActionGroup(true, false), false)
})

test('actionGroupDefaultExpanded follows the same visibility rule', () => {
  assert.equal(actionGroupDefaultExpanded(true, false, true), true)
  assert.equal(actionGroupDefaultExpanded(true, false, false), false)
})

test('comanda and preparation action groups stay visible with view-only access', () => {
  const byId = Object.fromEntries(PERMISSION_ACTION_GROUPS.map((group) => [group.id, group]))

  assert.equal(byId.eventsComanda.requireViewOnly, true)
  assert.equal(byId.logisticsPreparationActions.requireViewOnly, true)
  assert.equal(byId.logisticsPreparationWarehouses.requireViewOnly, true)
  assert.equal(byId.eventsActions.requireViewOnly, undefined)
  assert.equal(byId.mediaDelete.requireViewOnly, undefined)
  assert.equal(byId.decoTicketsActions.visibleWhen.path, '/menu/deco/tickets')
  assert.equal(byId.decoTicketsActions.actions.length, 6)

  assert.equal(
    shouldShowActionGroup(true, false, byId.eventsComanda.requireViewOnly),
    true
  )
  assert.equal(
    shouldShowActionGroup(true, false, byId.eventsActions.requireViewOnly),
    false
  )
})
