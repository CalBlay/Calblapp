const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { getVisibleModules } = require('../src/lib/accessControl')
const { DISPONIBILITAT_UI_PATH } = require('../src/lib/disponibilitatPermissions')

const ROOT = path.join(__dirname, '..')

const MUTATION_ROUTES = [
  'src/app/api/transports/assign/route.ts',
  'src/app/api/transports/assign/[id]/accept/route.ts',
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

function seesDisponibilitatModule(user) {
  return getVisibleModules(user).some((mod) =>
    (mod.submodules || []).some((sub) => sub.path === DISPONIBILITAT_UI_PATH)
  )
}

test('DISPONIBILITAT_UI_PATH matches the Logistica Disponibilitat submenu', () => {
  assert.equal(DISPONIBILITAT_UI_PATH, '/menu/logistica/disponibilitat')
})

test('logistics managers can see Disponibilitat; workers and other departments cannot', () => {
  assert.equal(
    seesDisponibilitatModule({ role: 'cap', department: 'logistica', id: 'cap-1' }),
    true
  )
  assert.equal(
    seesDisponibilitatModule({ role: 'admin', department: 'direccio', id: 'admin-1' }),
    true
  )
  assert.equal(
    seesDisponibilitatModule({ role: 'direccio', department: 'direccio', id: 'dir-1' }),
    true
  )
  assert.equal(
    seesDisponibilitatModule({ role: 'treballador', department: 'logistica', id: 'log-w' }),
    false
  )
  assert.equal(
    seesDisponibilitatModule({ role: 'treballador', department: 'manteniment', id: 'mnt-w' }),
    false
  )
  assert.equal(
    seesDisponibilitatModule({ role: 'cap', department: 'cuina', id: 'cuina-cap' }),
    false
  )
  assert.equal(
    seesDisponibilitatModule({ role: 'comercial', department: 'empresa', id: 'com-1' }),
    false
  )
})

test('assign POST and accept require edit gate before Firestore writes', () => {
  for (const relPath of MUTATION_ROUTES) {
    const source = readRoute(relPath)
    assert.match(
      source,
      /from\s+['"]@\/lib\/server\/disponibilitatApiAuth['"]/,
      `${relPath} must import requireDisponibilitatEdit`
    )
    const post = handlerBody(source, 'POST')
    assert.match(post, /await requireDisponibilitatEdit\s*\(\s*\)/)
    assert.match(post, /if\s*\(\s*!auth\.ok\s*\)\s*return\s+auth\.res/)

    const editIdx = post.indexOf('await requireDisponibilitatEdit()')
    const writeMarkers = ['db.collection', 'firestoreAdmin']
    for (const marker of writeMarkers) {
      const writeIdx = post.indexOf(marker)
      if (writeIdx === -1) continue
      assert.ok(
        editIdx !== -1 && editIdx < writeIdx,
        `${relPath}: requireDisponibilitatEdit must run before ${marker}`
      )
    }
  }
})

test('GET assign is not edit-gated (list auth is a separate leftover)', () => {
  const source = readRoute('src/app/api/transports/assign/route.ts')
  const get = handlerBody(source, 'GET')
  assert.doesNotMatch(get, /requireDisponibilitatEdit/)
})
