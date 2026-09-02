const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  extractUserConfigTemplate,
  cloneAssignmentOverrides,
} = require('../src/lib/permissions/userConfigTemplate')

test('extractUserConfigTemplate defaults profile flags used when copying Settings templates', () => {
  const template = extractUserConfigTemplate('u-1', { email: 'anna@example.com' }, null)

  assert.equal(template.sourceUserId, 'u-1')
  assert.equal(template.sourceName, 'anna@example.com')
  assert.deepEqual(template.overrides, [])
  assert.equal(template.profile.opsProjectsConfigurable, true)
  assert.equal(template.profile.available, true)
  assert.equal(template.profile.opsEventsConfigurable, false)
  assert.equal(template.profile.canRespondSurveys, false)
  assert.equal(template.profile.isDepartmentRobaLead, false)
  assert.equal(template.profile.isTransportLead, false)
  assert.equal(template.profile.isDriver, false)
  assert.equal(template.profile.workerRank, 'equip')
  assert.deepEqual(template.profile.opsChannelsConfigurable, [])
})

test('extractUserConfigTemplate reads driver nested flag and trims blank workerRank', () => {
  const template = extractUserConfigTemplate(
    'u-2',
    {
      name: '  Anna  ',
      workerRank: '   ',
      driver: { isDriver: true },
      opsChannelsConfigurable: [' ops-a ', '', 12],
      opsProjectsConfigurable: false,
      available: false,
    },
    { overrides: [] }
  )

  assert.equal(template.sourceName, 'Anna')
  assert.equal(template.profile.workerRank, 'equip')
  assert.equal(template.profile.isDriver, true)
  assert.equal(template.profile.opsProjectsConfigurable, false)
  assert.equal(template.profile.available, false)
  assert.deepEqual(template.profile.opsChannelsConfigurable, ['ops-a', '12'])
})

test('extractUserConfigTemplate parses assignment overrides with deny/scope defaults', () => {
  const template = extractUserConfigTemplate(
    'u-3',
    { name: 'Oriol' },
    {
      overrides: [
        { permission: '   ', effect: 'deny' },
        { permission: 'ui:view:/menu/events', effect: 'Deny', scope: 'Centre', scopeId: '  ' },
        { permission: 'ui:edit:/menu/events', effect: 'allow' },
        {
          permission: 'ui:action:/menu/events:comanda:prepare',
          effect: 'deny',
          scope: 'project',
          scopeId: 'p-1',
          note: 'prep',
        },
        {
          permission: 'ui:view:/menu/spaces',
          effect: 'allow',
          scope: 'centre',
          scopeId: 44,
        },
        null,
        'skip',
      ],
    }
  )

  assert.deepEqual(template.overrides, [
    {
      permission: 'ui:view:/menu/events',
      effect: 'allow',
      scope: 'client',
      scopeId: '',
      note: null,
    },
    {
      permission: 'ui:edit:/menu/events',
      effect: 'allow',
      scope: 'client',
      scopeId: null,
      note: null,
    },
    {
      permission: 'ui:action:/menu/events:comanda:prepare',
      effect: 'deny',
      scope: 'project',
      scopeId: 'p-1',
      note: 'prep',
    },
    {
      permission: 'ui:view:/menu/spaces',
      effect: 'allow',
      scope: 'centre',
      scopeId: '44',
      note: null,
    },
  ])
})

test('cloneAssignmentOverrides copies entries so later matrix edits do not mutate the template', () => {
  const original = [
    {
      permission: 'ui:view:/menu/events',
      effect: 'allow',
      scope: 'client',
      scopeId: null,
      note: 'src',
    },
  ]
  const cloned = cloneAssignmentOverrides(original)
  cloned[0].effect = 'deny'
  cloned[0].note = 'edited'
  cloned.push({
    permission: 'ui:edit:/menu/events',
    effect: 'allow',
    scope: 'client',
    scopeId: null,
    note: null,
  })

  assert.equal(original.length, 1)
  assert.equal(original[0].effect, 'allow')
  assert.equal(original[0].note, 'src')
})
