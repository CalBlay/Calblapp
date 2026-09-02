const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  SETTINGS_ARTICLES_PATH,
  SETTINGS_MAGATZEMS_PATH,
  SETTINGS_SERVEIS_PATH,
  SETTINGS_UI_PATH,
  canEditSettingsSubpath,
  canViewSettingsSubpath,
} = require('../src/lib/settingsPermissions')

test('settings path constants stay under /menu/settings', () => {
  assert.equal(SETTINGS_UI_PATH, '/menu/settings')
  assert.equal(SETTINGS_SERVEIS_PATH, '/menu/settings/serveis')
  assert.equal(SETTINGS_MAGATZEMS_PATH, '/menu/settings/magatzems')
  assert.equal(SETTINGS_ARTICLES_PATH, '/menu/settings/articles')
})

test('canViewSettingsSubpath grants access via the exact subpath or parent settings path', () => {
  const viewed = []
  const canViewPath = (path) => {
    viewed.push(path)
    return path === SETTINGS_SERVEIS_PATH
  }
  assert.equal(canViewSettingsSubpath(canViewPath, SETTINGS_SERVEIS_PATH), true)
  assert.deepEqual(viewed, [SETTINGS_SERVEIS_PATH])

  const parentOnly = (path) => path === SETTINGS_UI_PATH
  assert.equal(canViewSettingsSubpath(parentOnly, SETTINGS_ARTICLES_PATH), true)

  const deny = () => false
  assert.equal(canViewSettingsSubpath(deny, SETTINGS_MAGATZEMS_PATH), false)
})

test('canEditSettingsSubpath grants edit via the exact subpath or parent settings path', () => {
  const canEditPath = (path) => path === SETTINGS_UI_PATH
  assert.equal(canEditSettingsSubpath(canEditPath, SETTINGS_SERVEIS_PATH), true)

  const subpathOnly = (path) => path === SETTINGS_SERVEIS_PATH
  assert.equal(canEditSettingsSubpath(subpathOnly, SETTINGS_SERVEIS_PATH), true)

  const deny = () => false
  assert.equal(canEditSettingsSubpath(deny, SETTINGS_SERVEIS_PATH), false)
})
