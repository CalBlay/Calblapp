const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const viewPaths = new Set()
const editPaths = new Set()

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === 'next-auth/next' || request === 'next-auth') {
    return { getServerSession: async () => null }
  }
  if (
    request === '@/lib/server/authOptions' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]authOptions\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { authOptions: {} }
  }
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  if (
    request === '@/lib/server/permissions' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]permissions\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return {
      canViewUiPath: async ({ path }) => viewPaths.has(path),
      canEditUiPath: async ({ path }) => editPaths.has(path),
      isUiPermissionGranted: async () => false,
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  SETTINGS_SERVEIS_PATH,
  SETTINGS_UI_PATH,
} = require('../src/lib/settingsPermissions')
const {
  requireSettingsServeisView,
  requireSettingsServeisEdit,
} = require('../src/lib/server/settingsApiAuth')

after(() => {
  Module._load = originalLoad
})

function auth() {
  return {
    ok: true,
    session: {},
    user: { id: 'u-1', role: 'cap' },
    role: 'cap',
  }
}

test('requireSettingsServeisView allows the serveis path or parent settings view', async () => {
  viewPaths.clear()
  editPaths.clear()
  assert.equal(await requireSettingsServeisView(auth()), false)

  viewPaths.add(SETTINGS_SERVEIS_PATH)
  assert.equal(await requireSettingsServeisView(auth()), true)

  viewPaths.clear()
  viewPaths.add(SETTINGS_UI_PATH)
  assert.equal(await requireSettingsServeisView(auth()), true)
})

test('requireSettingsServeisEdit allows the serveis path or parent settings edit', async () => {
  viewPaths.clear()
  editPaths.clear()
  assert.equal(await requireSettingsServeisEdit(auth()), false)

  editPaths.add(SETTINGS_SERVEIS_PATH)
  assert.equal(await requireSettingsServeisEdit(auth()), true)

  editPaths.clear()
  editPaths.add(SETTINGS_UI_PATH)
  assert.equal(await requireSettingsServeisEdit(auth()), true)

  editPaths.clear()
  viewPaths.add(SETTINGS_SERVEIS_PATH)
  viewPaths.add(SETTINGS_UI_PATH)
  assert.equal(await requireSettingsServeisEdit(auth()), false)
})
