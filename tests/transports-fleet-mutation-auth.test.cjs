const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { getVisibleModules } = require('../src/lib/accessControl')
const { TRANSPORTS_UI_PATH } = require('../src/lib/transportsPermissions')

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
