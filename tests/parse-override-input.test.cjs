const assert = require('node:assert/strict')
const { test } = require('node:test')

const { parseOverrideInput } = require('../src/lib/permissions/parseOverrideInput')

test('parseOverrideInput drops non-objects and blank permissions', () => {
  assert.equal(parseOverrideInput(null), null)
  assert.equal(parseOverrideInput('ui:view:/menu/x'), null)
  assert.equal(parseOverrideInput({ permission: '  ' }), null)
  assert.equal(parseOverrideInput({ permission: '' }), null)
})

test('parseOverrideInput defaults effect to allow and scope to client', () => {
  assert.deepEqual(parseOverrideInput({ permission: ' ui:view:/menu/calendar ' }), {
    permission: 'ui:view:/menu/calendar',
    effect: 'allow',
    scope: 'client',
    scopeId: null,
    note: null,
  })
})

test('parseOverrideInput only treats exact deny as deny and unknown scopes as client', () => {
  assert.equal(parseOverrideInput({ permission: 'p', effect: 'deny' }).effect, 'deny')
  assert.equal(parseOverrideInput({ permission: 'p', effect: 'Deny' }).effect, 'allow')
  assert.equal(parseOverrideInput({ permission: 'p', effect: 'allow' }).effect, 'allow')
  assert.equal(parseOverrideInput({ permission: 'p', scope: 'centre' }).scope, 'centre')
  assert.equal(parseOverrideInput({ permission: 'p', scope: 'project' }).scope, 'project')
  assert.equal(parseOverrideInput({ permission: 'p', scope: 'server' }).scope, 'client')
})

test('parseOverrideInput trims scopeId and note, treating empty as null', () => {
  assert.deepEqual(
    parseOverrideInput({
      permission: 'ui:edit:/menu/projects',
      effect: 'deny',
      scope: 'project',
      scopeId: '  proj-1  ',
      note: '  matrix  ',
    }),
    {
      permission: 'ui:edit:/menu/projects',
      effect: 'deny',
      scope: 'project',
      scopeId: 'proj-1',
      note: 'matrix',
    }
  )
  assert.equal(parseOverrideInput({ permission: 'p', scopeId: '' }).scopeId, null)
  assert.equal(parseOverrideInput({ permission: 'p', note: '' }).note, null)
})
