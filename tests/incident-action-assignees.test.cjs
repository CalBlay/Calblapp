const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const {
  canBeIncidentActionAssignee,
  incidentActionAssigneeUserPatch,
} = require('../src/lib/incidentActionAssignees')
const {
  capDepartmentMatchesIncidentOrigin,
} = require('../src/lib/incidentOriginDepartments')

test('explicit incident action setting allows workers and caps are always included', () => {
  assert.equal(
    canBeIncidentActionAssignee({ role: 'Treballador', canBeIncidentActionAssignee: true }),
    true
  )
  assert.equal(
    canBeIncidentActionAssignee({ role: 'Cap Departament', canBeIncidentActionAssignee: false }),
    true
  )
})

test('caps remain eligible without the setting while unmarked workers do not', () => {
  assert.equal(canBeIncidentActionAssignee({ role: 'Cap Departament' }), true)
  assert.equal(canBeIncidentActionAssignee({ role: 'Treballador' }), false)
})

test('eligible assignees still have to match the selected action department', () => {
  assert.equal(capDepartmentMatchesIncidentOrigin('Produccio', 'Producció'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Produccio', 'Serveis'), false)
  assert.equal(capDepartmentMatchesIncidentOrigin('Comercial', 'Casaments'), true)
})

test('omitting the flag from a permissions PUT must not clear it', () => {
  assert.equal(incidentActionAssigneeUserPatch(null), null)
  assert.equal(incidentActionAssigneeUserPatch({}), null)
  assert.equal(
    incidentActionAssigneeUserPatch({
      base: { role: 'treballador' },
      overrides: [],
    }),
    null
  )
  assert.deepEqual(
    incidentActionAssigneeUserPatch({ canBeIncidentActionAssignee: true }),
    { canBeIncidentActionAssignee: true }
  )
  assert.deepEqual(
    incidentActionAssigneeUserPatch({ canBeIncidentActionAssignee: false }),
    { canBeIncidentActionAssignee: false }
  )
})

test('Settings persists the option and the incident selector consumes it', () => {
  const settingsSource = fs.readFileSync(
    path.join(ROOT, 'src/app/menu/settings/permisos/[userId]/page.tsx'),
    'utf8'
  )
  const listSource = fs.readFileSync(
    path.join(ROOT, 'src/app/menu/settings/permisos/page.tsx'),
    'utf8'
  )
  const settingsApiSource = fs.readFileSync(
    path.join(ROOT, 'src/app/api/admin/permissions/assignments/[userId]/route.ts'),
    'utf8'
  )
  const selectorApiSource = fs.readFileSync(
    path.join(ROOT, 'src/app/api/incidents/caps/route.ts'),
    'utf8'
  )

  assert.match(settingsSource, /Rebre accions/)
  assert.match(settingsSource, /r\.path === '\/menu\/incidents'/)
  assert.match(settingsSource, /canBeIncidentActionAssignee,/)
  assert.match(settingsApiSource, /incidentActionAssigneeUserPatch/)
  assert.match(listSource, /method:\s*'PUT'/)
  assert.doesNotMatch(
    listSource,
    /canBeIncidentActionAssignee/
  )
  assert.match(selectorApiSource, /canBeIncidentActionAssignee\(data\)/)
  assert.match(selectorApiSource, /capDepartmentMatchesIncidentOrigin/)
})
