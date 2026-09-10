const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

let session = null
const viewPaths = new Set()
const editPaths = new Set()

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === 'next-auth/next' || request === 'next-auth') {
    return { getServerSession: async () => session }
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
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  MAINTENANCE_TICKET_API_VIEW_PATHS,
  MAINTENANCE_TICKETS_PATH,
  canUseMaintenanceTicketApi,
  requireMaintenanceTicketApiView,
  requireMaintenanceTicketApiCreate,
  requireMaintenanceDataAccess,
} = require('../src/lib/server/maintenanceApiAuth')

after(() => {
  Module._load = originalLoad
})

function sessionUser(overrides = {}) {
  return {
    id: 'u-1',
    name: 'Anna',
    role: 'treballador',
    department: 'deco',
    ...overrides,
  }
}

test('maintenance ticket API view paths include Deco tickets and planner', () => {
  assert.ok(MAINTENANCE_TICKET_API_VIEW_PATHS.includes(MAINTENANCE_TICKETS_PATH))
  assert.ok(MAINTENANCE_TICKET_API_VIEW_PATHS.includes('/menu/deco/tickets'))
  assert.ok(MAINTENANCE_TICKET_API_VIEW_PATHS.includes('/menu/deco/planificador'))
  assert.ok(MAINTENANCE_TICKET_API_VIEW_PATHS.includes('/menu/manteniment/dades'))
})

test('canUseMaintenanceTicketApi grants access from any listed module, including Deco', async () => {
  const user = sessionUser()

  viewPaths.clear()
  assert.equal(await canUseMaintenanceTicketApi(user), false)

  viewPaths.add('/menu/deco/tickets')
  assert.equal(await canUseMaintenanceTicketApi(user), true)

  viewPaths.clear()
  viewPaths.add('/menu/deco/planificador')
  assert.equal(await canUseMaintenanceTicketApi(user), true)

  viewPaths.clear()
  viewPaths.add('/menu/events')
  assert.equal(await canUseMaintenanceTicketApi(user), false)
})

test('requireMaintenanceTicketApiView is 401 without session and 403 without a listed path', async () => {
  session = null
  viewPaths.clear()
  const unauthenticated = await requireMaintenanceTicketApiView()
  assert.equal(unauthenticated.ok, false)
  assert.equal(unauthenticated.res.status, 401)

  session = { user: sessionUser() }
  const denied = await requireMaintenanceTicketApiView()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)
  const body = await denied.res.json()
  assert.equal(body.error, 'Sense permisos')

  viewPaths.add('/menu/deco/tickets')
  const allowed = await requireMaintenanceTicketApiView()
  assert.equal(allowed.ok, true)
  assert.equal(allowed.user.id, 'u-1')
})

test('requireMaintenanceDataAccess lets Deco ticket viewers read master data but not edit it', async () => {
  session = { user: sessionUser({ role: 'cap', department: 'Decoració' }) }
  viewPaths.clear()
  editPaths.clear()

  viewPaths.add('/menu/deco/tickets')
  const decoView = await requireMaintenanceDataAccess('view')
  assert.equal(decoView.ok, true)

  const decoCannotEdit = await requireMaintenanceDataAccess('edit')
  assert.equal(decoCannotEdit.ok, false)
  assert.equal(decoCannotEdit.res.status, 403)

  viewPaths.clear()
  viewPaths.add('/menu/manteniment/dades')
  const dadesView = await requireMaintenanceDataAccess()
  assert.equal(dadesView.ok, true)

  editPaths.add('/menu/manteniment/dades')
  const dadesEdit = await requireMaintenanceDataAccess('edit')
  assert.equal(dadesEdit.ok, true)

  viewPaths.clear()
  editPaths.clear()
  editPaths.add('/menu/deco/tickets')
  const decoEditIsNotDadesEdit = await requireMaintenanceDataAccess('edit')
  assert.equal(decoEditIsNotDadesEdit.ok, false)
})

test('requireMaintenanceTicketApiCreate on the Deco path requires edit unless the user is a reporter', async () => {
  viewPaths.clear()
  editPaths.clear()

  session = { user: sessionUser({ role: 'treballador', department: 'deco' }) }
  viewPaths.add('/menu/deco/tickets')
  const decoViewer = await requireMaintenanceTicketApiCreate('/menu/deco/tickets')
  assert.equal(decoViewer.ok, false)
  assert.equal(decoViewer.res.status, 403)

  editPaths.add('/menu/deco/tickets')
  const decoEditor = await requireMaintenanceTicketApiCreate('/menu/deco/tickets')
  assert.equal(decoEditor.ok, true)

  viewPaths.clear()
  editPaths.clear()
  session = { user: sessionUser({ role: 'treballador', department: 'serveis' }) }
  viewPaths.add('/menu/deco/tickets')
  const serveisReporter = await requireMaintenanceTicketApiCreate('/menu/deco/tickets')
  assert.equal(serveisReporter.ok, true)
})
