const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { getVisibleModules } = require('../src/lib/accessControl')
const {
  TRANSPORTS_TYPES_MANAGE_PERM,
  TRANSPORTS_UI_PATH,
} = require('../src/lib/transportsPermissions')
const { PERMISSION_ACTION_GROUPS } = require('../src/lib/permissions/matrixConfig')

const ROOT = path.join(__dirname, '..')

function readRoute(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function handlerBody(source, method) {
  const re = new RegExp(
    `export\\s+async\\s+function\\s+${method}\\b[\\s\\S]*?(?=export\\s+async\\s+function\\s+(?:GET|POST|PUT|PATCH|DELETE)\\b|$)`
  )
  const match = source.match(re)
  assert.ok(match, `expected exported ${method} handler`)
  return match[0]
}

function seesTransportsModule(user) {
  return getVisibleModules(user).some((mod) =>
    (mod.submodules || []).some((sub) => sub.path === TRANSPORTS_UI_PATH)
  )
}

test('TRANSPORTS_UI_PATH matches the Logistica Transports submenu', () => {
  assert.equal(TRANSPORTS_UI_PATH, '/menu/logistica/transports')
})

test('vehicle typologies have an explicit permission in the Settings matrix', () => {
  assert.equal(
    TRANSPORTS_TYPES_MANAGE_PERM,
    'ui:action:/menu/logistica/transports:types-manage'
  )
  assert.equal(
    PERMISSION_ACTION_GROUPS.some((group) =>
      group.actions.some((action) => action.key === TRANSPORTS_TYPES_MANAGE_PERM)
    ),
    true
  )
})

test('logistics cap can see the Transports submenu; workers and maintenance cannot', () => {
  assert.equal(
    seesTransportsModule({ role: 'cap', department: 'logistica', id: 'cap-1' }),
    true
  )
  assert.equal(
    seesTransportsModule({ role: 'admin', department: 'direccio', id: 'admin-1' }),
    true
  )
  assert.equal(
    seesTransportsModule({ role: 'treballador', department: 'logistica', id: 'log-w' }),
    false
  )
  assert.equal(
    seesTransportsModule({ role: 'treballador', department: 'manteniment', id: 'mnt-w' }),
    false
  )
  assert.equal(
    seesTransportsModule({ role: 'cap', department: 'cuina', id: 'cuina-cap' }),
    false
  )
})

test('fleet POST requires transports edit after auth', () => {
  const source = readRoute('src/app/api/transports/route.ts')
  const post = handlerBody(source, 'POST')
  assert.match(post, /await requireAuth\s*\(\s*\)/)
  assert.match(post, /requireTransportsFleetEdit/)
  assert.ok(post.indexOf('await requireAuth()') < post.indexOf('requireTransportsFleetEdit'))
  assert.ok(post.indexOf('requireTransportsFleetEdit') < post.indexOf('firestoreAdmin.collection'))
})

test('fleet GET stays session-only so maintenance/reserva can list vehicles', () => {
  const source = readRoute('src/app/api/transports/route.ts')
  const get = handlerBody(source, 'GET')
  assert.match(get, /await requireAuth\s*\(\s*\)/)
  assert.doesNotMatch(get, /requireTransportsFleetEdit/)
})

test('fleet PUT and DELETE require transports edit before Firestore writes', () => {
  const source = readRoute('src/app/api/transports/[id]/route.ts')
  assert.match(source, /from\s+['"]@\/lib\/server\/apiAuth['"]/)
  assert.match(source, /from\s+['"]@\/lib\/server\/transportsApiAuth['"]/)

  for (const method of ['PUT', 'DELETE']) {
    const body = handlerBody(source, method)
    assert.match(body, /await requireAuth\s*\(\s*\)/)
    assert.match(body, /requireTransportsFleetEdit/)
    const authIdx = body.indexOf('await requireAuth()')
    const editIdx = body.indexOf('requireTransportsFleetEdit')
    const writeIdx = body.indexOf('db.collection')
    assert.ok(authIdx !== -1 && editIdx !== -1 && writeIdx !== -1)
    assert.ok(authIdx < editIdx, `${method}: auth before edit gate`)
    assert.ok(editIdx < writeIdx, `${method}: edit gate before Firestore write`)
  }
})

test('transport type mutations require the dedicated permission before Firestore writes', () => {
  for (const [routePath, methods] of [
    ['src/app/api/transport-types/route.ts', ['POST']],
    ['src/app/api/transport-types/[id]/route.ts', ['PATCH', 'DELETE']],
  ]) {
    const source = readRoute(routePath)
    for (const method of methods) {
      const body = handlerBody(source, method)
      assert.match(body, /await requireAuth\s*\(\s*\)/)
      assert.match(body, /requireTransportsTypesManage/)
      assert.ok(body.indexOf('requireTransportsTypesManage') < body.indexOf('firestoreAdmin.collection'))
    }
  }
})

test('transport typologies tab is gated by its action permission', () => {
  const source = readRoute('src/app/menu/logistica/transports/page.tsx')
  assert.match(source, /hasAction\(TRANSPORTS_TYPES_MANAGE_PERM\)/)
  assert.match(source, /canManageTypes/)
})

test('fleet mutation controls are gated by the Transports edit permission', () => {
  const page = readRoute('src/app/menu/logistica/transports/page.tsx')
  const card = readRoute('src/components/transports/TransportCard.tsx')

  assert.match(page, /canEditPath\(TRANSPORTS_UI_PATH\)/)
  assert.match(page, /canEdit=\{canEditFleet\}/)
  assert.match(page, /canEditFleet\s*\?\s*<FloatingAddButton/)
  assert.match(page, /canEditFleet\s*\?\s*\(\s*<NewTransportModal/)
  assert.match(card, /if\s*\(!canEdit\)\s*return/)
  assert.match(card, /\{canEdit\s*\?\s*\(/)
})
