const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, beforeEach, test } = require('node:test')

let authResult = { ok: false, res: { status: 401 } }
const viewPaths = new Set()
const editPaths = new Set()
const overrideByPermission = new Map()

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
    request === '@/lib/server/apiAuth' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]apiAuth\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return {
      requireAuth: async () => authResult,
      requireRoles: () => null,
    }
  }
  if (
    request === '@/lib/server/permissions' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]permissions\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return {
      canViewUiPath: async ({ path }) => viewPaths.has(path),
      canEditUiPath: async ({ path }) => editPaths.has(path),
      isAllowedByClientOverride: async ({ permission }) =>
        overrideByPermission.has(permission) ? overrideByPermission.get(permission) : null,
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const {
  ALLERGENS_BBDD_PATH,
  ALLERGENS_BUSCADOR_PATH,
  requireAllergensModuleView,
  requireAllergensBbddView,
  requireAllergensBbddEdit,
  requireAllergensImportOrReplace,
} = require('../src/lib/server/allergensApiAuth')
const { PERM } = require('../src/lib/permissionKeys')

function auth(role = 'cap') {
  return {
    ok: true,
    session: {},
    user: { id: 'u-1', role, department: 'qualitat' },
    role,
  }
}

beforeEach(() => {
  authResult = auth()
  viewPaths.clear()
  editPaths.clear()
  overrideByPermission.clear()
})

test('requireAllergensModuleView returns the auth failure when there is no session', async () => {
  authResult = { ok: false, res: { status: 401 } }
  const denied = await requireAllergensModuleView()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 401)
})

test('requireAllergensModuleView allows BBDD or buscador view and denies when neither is granted', async () => {
  let denied = await requireAllergensModuleView()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)
  const body = await denied.res.json()
  assert.equal(body.error, 'Forbidden')

  viewPaths.add(ALLERGENS_BUSCADOR_PATH)
  const buscadorOnly = await requireAllergensModuleView()
  assert.equal(buscadorOnly.ok, true)
  assert.equal(buscadorOnly.user.id, 'u-1')

  viewPaths.clear()
  viewPaths.add(ALLERGENS_BBDD_PATH)
  const bbddOnly = await requireAllergensModuleView()
  assert.equal(bbddOnly.ok, true)
})

test('requireAllergensBbddView does not accept buscador-only access', async () => {
  viewPaths.add(ALLERGENS_BUSCADOR_PATH)
  const denied = await requireAllergensBbddView()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)

  viewPaths.add(ALLERGENS_BBDD_PATH)
  const allowed = await requireAllergensBbddView()
  assert.equal(allowed.ok, true)
})

test('requireAllergensBbddEdit needs BBDD view and edit together', async () => {
  viewPaths.add(ALLERGENS_BBDD_PATH)
  const viewOnly = await requireAllergensBbddEdit()
  assert.equal(viewOnly.ok, false)
  assert.equal(viewOnly.res.status, 403)

  editPaths.add(ALLERGENS_BBDD_PATH)
  const allowed = await requireAllergensBbddEdit()
  assert.equal(allowed.ok, true)
})

test('requireAllergensImportOrReplace accepts BBDD edit or import/replace overrides', async () => {
  const session = auth('treballador')

  let denied = await requireAllergensImportOrReplace(session)
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)

  editPaths.add(ALLERGENS_BBDD_PATH)
  assert.equal(await requireAllergensImportOrReplace(session), null)

  editPaths.clear()
  overrideByPermission.set(PERM.action(ALLERGENS_BBDD_PATH, 'import'), true)
  assert.equal(await requireAllergensImportOrReplace(session), null)

  overrideByPermission.clear()
  overrideByPermission.set(PERM.action(ALLERGENS_BBDD_PATH, 'replace'), true)
  assert.equal(await requireAllergensImportOrReplace(session), null)

  overrideByPermission.clear()
  overrideByPermission.set(PERM.action(ALLERGENS_BBDD_PATH, 'import'), false)
  overrideByPermission.set(PERM.action(ALLERGENS_BBDD_PATH, 'replace'), null)
  denied = await requireAllergensImportOrReplace(session)
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)
})
