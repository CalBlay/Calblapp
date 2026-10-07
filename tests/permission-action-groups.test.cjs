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
  assert.equal(actionGroupDefaultExpanded(false, false, false, true), true)
})

test('comanda and preparation action groups stay visible with view-only access', () => {
  const byId = Object.fromEntries(PERMISSION_ACTION_GROUPS.map((group) => [group.id, group]))

  assert.equal(byId.eventsComanda.requireViewOnly, true)
  assert.equal(byId.reportsTabs.requireViewOnly, true)
  assert.equal(byId.reportsTabs.defaultAllowed, true)
  assert.equal(byId.reportsTabs.actions.length, 5)
  assert.deepEqual(
    byId.reportsTabs.actions.map((action) => action.label),
    ['RRHH', 'Auditories', 'Transports', 'Manteniment', 'Esdeveniments']
  )
  assert.equal(byId.logisticsPreparationActions.requireViewOnly, true)
  assert.equal(byId.logisticsPreparationWarehouses.requireViewOnly, true)
  assert.equal(byId.eventsActions.requireViewOnly, undefined)
  assert.equal(byId.eventDocumentsAccess.independentOfModule, true)
  assert.equal(byId.eventDocumentsAccess.actions.length, 1)
  assert.match(byId.eventDocumentsAccess.actions[0].key, /docs:view$/)
  assert.equal(byId.mediaDelete.requireViewOnly, undefined)
  assert.equal(byId.decoTicketsActions.visibleWhen.path, '/menu/deco/tickets')
  assert.equal(byId.decoTicketsActions.actions.length, 6)
  assert.equal(byId.quadrantsActions.actions.find((a) => a.key.includes('draft:unconfirm'))?.label, 'Reobrir quadrant')

  assert.equal(
    shouldShowActionGroup(true, false, byId.eventsComanda.requireViewOnly),
    true
  )
  assert.equal(
    shouldShowActionGroup(true, false, byId.eventsActions.requireViewOnly),
    false
  )
  assert.equal(
    shouldShowActionGroup(
      false,
      false,
      byId.eventDocumentsAccess.requireViewOnly,
      byId.eventDocumentsAccess.independentOfModule
    ),
    true
  )
})
