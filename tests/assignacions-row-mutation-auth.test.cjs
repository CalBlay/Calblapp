const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { getVisibleModules } = require('../src/lib/accessControl')
const { ASSIGNACIONS_UI_PATH } = require('../src/lib/assignacionsPermissions')

const ROOT = path.join(__dirname, '..')

const MUTATION_ROUTES = [
  'src/app/api/transports/assignacions/row/save/route.ts',
  'src/app/api/transports/assignacions/row/delete/route.ts',
  'src/app/api/transports/assignacions/row/add/route.ts',
]

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

function seesAssignacionsModule(user) {
  return getVisibleModules(user).some((mod) =>
    (mod.submodules || []).some((sub) => sub.path === ASSIGNACIONS_UI_PATH)
  )
}

test('ASSIGNACIONS_UI_PATH matches the Logistica Assignacions submenu', () => {
  assert.equal(ASSIGNACIONS_UI_PATH, '/menu/logistica/assignacions')
})

test('logistics managers can see Assignacions; workers and other departments cannot', () => {
  assert.equal(
    seesAssignacionsModule({ role: 'cap', department: 'logistica', id: 'cap-1' }),
    true
  )
  assert.equal(
    seesAssignacionsModule({ role: 'admin', department: 'direccio', id: 'admin-1' }),
    true
  )
  assert.equal(
    seesAssignacionsModule({ role: 'direccio', department: 'direccio', id: 'dir-1' }),
    true
  )
  assert.equal(
    seesAssignacionsModule({ role: 'treballador', department: 'logistica', id: 'log-w' }),
    false
  )
  assert.equal(
    seesAssignacionsModule({ role: 'treballador', department: 'manteniment', id: 'mnt-w' }),
    false
  )
  assert.equal(
    seesAssignacionsModule({ role: 'cap', department: 'cuina', id: 'cuina-cap' }),
    false
  )
  assert.equal(
    seesAssignacionsModule({ role: 'comercial', department: 'empresa', id: 'com-1' }),
    false
  )
})

test('assignacions row save/delete/add require edit gate before Firestore writes', () => {
  for (const relPath of MUTATION_ROUTES) {
    const source = readRoute(relPath)
    assert.match(
      source,
      /from\s+['"]@\/lib\/server\/assignacionsApiAuth['"]/,
      `${relPath} must import requireAssignacionsEdit`
    )
    const post = handlerBody(source, 'POST')
    assert.match(post, /await requireAssignacionsEdit\s*\(\s*\)/)
    assert.match(post, /if\s*\(\s*!auth\.ok\s*\)\s*return\s+auth\.res/)

    const editIdx = post.indexOf('await requireAssignacionsEdit()')
    const writeMarkers = ['db.collection', 'firestoreAdmin']
    for (const marker of writeMarkers) {
      const writeIdx = post.indexOf(marker)
      if (writeIdx === -1) continue
      assert.ok(
        editIdx !== -1 && editIdx < writeIdx,
        `${relPath}: requireAssignacionsEdit must run before ${marker}`
      )
    }
  }
})

test('GET assignacions stays session-only so Reserva comercials can list occupancy', () => {
  const source = readRoute('src/app/api/transports/assignacions/route.ts')
  const get = handlerBody(source, 'GET')
  assert.match(get, /await requireAuth\s*\(\s*\)/)
  assert.doesNotMatch(get, /requireAssignacionsEdit/)
})
