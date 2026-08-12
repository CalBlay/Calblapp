const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  getClientOverrideEffect,
  effectiveAllowed,
  applyOverrideEffect,
  applyOverrideEffects,
} = require('../src/lib/permissions/overrideState')

test('getClientOverrideEffect only matches client-scoped overrides without scopeId', () => {
  const overrides = [
    { permission: 'view:/menu/x', effect: 'deny', scope: 'server', scopeId: null },
    { permission: 'view:/menu/x', effect: 'allow', scope: 'client', scopeId: 'dept-1' },
    { permission: 'edit:/menu/x', effect: 'deny', scope: 'client', scopeId: null },
    { permission: 'view:/menu/x', effect: 'deny', scope: 'client', scopeId: null },
  ]

  assert.equal(getClientOverrideEffect(overrides, 'view:/menu/x'), 'deny')
  assert.equal(getClientOverrideEffect(overrides, 'edit:/menu/x'), 'deny')
  assert.equal(getClientOverrideEffect(overrides, 'view:/menu/missing'), null)
})

test('effectiveAllowed: deny wins, allow elevates, null keeps base', () => {
  assert.equal(
    effectiveAllowed(
      [{ permission: 'p', effect: 'deny', scope: 'client', scopeId: null }],
      'p',
      true
    ),
    false
  )
  assert.equal(
    effectiveAllowed(
      [{ permission: 'p', effect: 'allow', scope: 'client', scopeId: null }],
      'p',
      false
    ),
    true
  )
  assert.equal(effectiveAllowed([], 'p', true), true)
  assert.equal(effectiveAllowed([], 'p', false), false)
})

test('applyOverrideEffect replaces client override or clears when effect is null', () => {
  const base = [
    { permission: 'view:/a', effect: 'deny', scope: 'client', scopeId: null, note: 'old' },
    { permission: 'view:/a', effect: 'allow', scope: 'server', scopeId: null, note: 'keep' },
    { permission: 'edit:/a', effect: 'allow', scope: 'client', scopeId: null, note: 'other' },
  ]

  const allowed = applyOverrideEffect(base, 'view:/a', 'allow', 'matrix')
  assert.deepEqual(
    allowed.filter((o) => o.permission === 'view:/a' && (o.scope || 'client') === 'client'),
    [{ permission: 'view:/a', effect: 'allow', scope: 'client', scopeId: null, note: 'matrix' }]
  )
  assert.ok(allowed.some((o) => o.scope === 'server' && o.note === 'keep'))
  assert.ok(allowed.some((o) => o.permission === 'edit:/a'))

  const cleared = applyOverrideEffect(base, 'view:/a', null)
  assert.equal(
    cleared.some(
      (o) => o.permission === 'view:/a' && (o.scope || 'client') === 'client' && !o.scopeId
    ),
    false
  )
  assert.ok(cleared.some((o) => o.scope === 'server'))
})

test('applyOverrideEffects applies batch updates in order', () => {
  const next = applyOverrideEffects(
    [],
    [
      { permission: 'view:/a', effect: 'allow' },
      { permission: 'edit:/a', effect: 'deny' },
      { permission: 'view:/a', effect: null },
    ],
    'batch'
  )
  assert.equal(getClientOverrideEffect(next, 'view:/a'), null)
  assert.equal(getClientOverrideEffect(next, 'edit:/a'), 'deny')
  assert.equal(next.find((o) => o.permission === 'edit:/a')?.note, 'batch')
})
