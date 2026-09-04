const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')
const read = (file) => readFileSync(join(root, file), 'utf8')

test('Ops channel permissions are managed from Settings permissions', () => {
  const settings = read('src/app/menu/settings/permisos/[userId]/page.tsx')

  assert.match(settings, /title="Ops · Canals"/)
  assert.match(settings, /opsChannelsConfigurable/)
  assert.match(settings, /opsEventsConfigurable/)
  assert.match(settings, /opsProjectsConfigurable/)
  assert.match(settings, /\/api\/messaging\/channels\?scope=all/)
})

test('the general user form no longer renders Ops channel controls', () => {
  const userForm = read('src/components/users/UserFormModal.tsx')

  assert.doesNotMatch(userForm, /Canals configurables \(Ops\)/)
  assert.match(userForm, /Permetre respondre sondeigs/)
})

test('the assignment API reads and writes Ops settings without resetting omitted fields', () => {
  const route = read('src/app/api/admin/permissions/assignments/[userId]/route.ts')

  assert.match(route, /opsChannelsConfigurable: Array\.isArray\(userData\.opsChannelsConfigurable\)/)
  assert.match(route, /opsChannelsConfigurable !== undefined/)
  assert.match(route, /opsEventsConfigurable !== undefined/)
  assert.match(route, /opsProjectsConfigurable !== undefined/)
})
