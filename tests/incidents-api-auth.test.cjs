const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, beforeEach, test } = require('node:test')

let authResult = { ok: false, res: { status: 401 } }
const viewPaths = new Set()
const grantedPermissions = new Set()

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
      canEditUiPath: async () => false,
      isUiPermissionGranted: async ({ permission }) => grantedPermissions.has(permission),
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const {
  INCIDENTS_UI_PATH,
  canViewIncidentsCommandBoard,
  canViewIncidentsModule,
  requireIncidentsModuleView,
  requireIncidentCategoriesRead,
  requireIncidentsMeetingMinutes,
  requireIncidentsCategoryEdit,
  requireIncidentsTypologiesManage,
} = require('../src/lib/server/incidentsApiAuth')
const {
  INCIDENTS_CATEGORY_EDIT_PERM,
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_MEETING_MINUTES_PERM,
  INCIDENTS_TYPOLOGIES_MANAGE_PERM,
} = require('../src/lib/incidentsPermissions')

function auth(user) {
  return {
    ok: true,
    session: {},
    user: { id: 'u-1', role: 'cap', department: 'produccio', ...user },
    role: user?.role || 'cap',
  }
}

beforeEach(() => {
  authResult = auth({})
  viewPaths.clear()
  grantedPermissions.clear()
})

test('incidents module view is board path OR command-board action; blank ids never grant', async () => {
  assert.equal(await canViewIncidentsModule({ id: '', role: 'admin' }), false)
  assert.equal(await canViewIncidentsModule({ id: '   ', role: 'cap' }), false)
  assert.equal(await canViewIncidentsCommandBoard({ id: '', role: 'admin' }), false)

  assert.equal(await canViewIncidentsModule({ id: 'u-1', role: 'cap' }), false)

  viewPaths.add(INCIDENTS_UI_PATH)
  assert.equal(await canViewIncidentsModule({ id: 'u-1', role: 'cap' }), true)

  viewPaths.clear()
  grantedPermissions.add(INCIDENTS_COMMAND_BOARD_PERM)
  assert.equal(await canViewIncidentsModule({ id: 'u-1', role: 'treballador' }), true)
  assert.equal(await canViewIncidentsCommandBoard({ id: 'u-1', role: 'treballador' }), true)
})

test('requireIncidentsModuleView returns 401 from auth and 403 Sense permisos without view', async () => {
  authResult = { ok: false, res: { status: 401 } }
  const unauth = await requireIncidentsModuleView()
  assert.equal(unauth.ok, false)
  assert.equal(unauth.res.status, 401)

  authResult = auth({})
  const denied = await requireIncidentsModuleView()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)
  const body = await denied.res.json()
  assert.equal(body.error, 'Sense permisos')

  viewPaths.add(INCIDENTS_UI_PATH)
  const allowed = await requireIncidentsModuleView()
  assert.equal(allowed.ok, true)
})

test('requireIncidentCategoriesRead allows posters without the incidents board', async () => {
  authResult = auth({ role: 'treballador', department: 'cuina' })
  const worker = await requireIncidentCategoriesRead()
  assert.equal(worker.ok, true)

  authResult = auth({ role: 'usuari', department: 'produccio', id: 'u-user' })
  const denied = await requireIncidentCategoriesRead()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)

  grantedPermissions.add(INCIDENTS_COMMAND_BOARD_PERM)
  const viaBoard = await requireIncidentCategoriesRead()
  assert.equal(viaBoard.ok, true)
})

test('meeting-minutes, category-edit, and typologies gates use distinct permission keys', async () => {
  let denied = await requireIncidentsMeetingMinutes()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)

  grantedPermissions.add(INCIDENTS_MEETING_MINUTES_PERM)
  const minutes = await requireIncidentsMeetingMinutes()
  assert.equal(minutes.ok, true)

  denied = await requireIncidentsCategoryEdit()
  assert.equal(denied.ok, false)
  grantedPermissions.add(INCIDENTS_CATEGORY_EDIT_PERM)
  const category = await requireIncidentsCategoryEdit()
  assert.equal(category.ok, true)

  denied = await requireIncidentsTypologiesManage()
  assert.equal(denied.ok, false)
  grantedPermissions.add(INCIDENTS_TYPOLOGIES_MANAGE_PERM)
  const typologies = await requireIncidentsTypologiesManage()
  assert.equal(typologies.ok, true)
})
