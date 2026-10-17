const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { canEditFinca } = require('../src/lib/accessControl')

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

test('calendar/search users who are not finca editors must not be able to mutate BBDD', () => {
  assert.equal(canEditFinca({ role: 'treballador', department: 'manteniment' }), false)
  assert.equal(canEditFinca({ role: 'cap', department: 'cuina' }), false)
  assert.equal(canEditFinca({ role: 'treballador', department: 'logistica' }), false)
  assert.equal(canEditFinca({ role: 'comercial' }), true)
  assert.equal(canEditFinca({ role: 'admin' }), true)
})

test('PATCH /api/finques/[id] requires spaces BBDD update before Firestore writes', () => {
  const source = readRoute('src/app/api/finques/[id]/route.ts')
  assert.match(source, /from\s+['"]@\/lib\/server\/apiAuth['"]/)
  assert.match(source, /from\s+['"]@\/lib\/server\/spacesApiAuth['"]/)

  const patch = handlerBody(source, 'PATCH')
  assert.match(patch, /await requireAuth\s*\(\s*\)/)
  assert.match(patch, /requireSpacesBbddMutation\s*\(\s*auth\s*,\s*['"]update['"]\s*\)/)
  assert.match(patch, /if\s*\(\s*!canUpdate\s*\)/)

  const authIdx = patch.indexOf('await requireAuth()')
  const editIdx = patch.indexOf('requireSpacesBbddMutation')
  const writeIdx = patch.indexOf('firestoreAdmin.collection')
  assert.ok(authIdx !== -1 && editIdx !== -1 && writeIdx !== -1)
  assert.ok(authIdx < editIdx, 'auth before BBDD update gate')
  assert.ok(editIdx < writeIdx, 'BBDD update gate before Firestore write')
})

test('GET /api/fincas/search stays session-only so Calendar can load finca ids', () => {
  const source = readRoute('src/app/api/fincas/search/route.ts')
  const get = handlerBody(source, 'GET')
  assert.match(get, /await requireAuth\s*\(\s*\)/)
  assert.doesNotMatch(get, /requireSpacesBbddMutation/)
})

test('POST /api/spaces/update already uses the same BBDD update gate', () => {
  const source = readRoute('src/app/api/spaces/update/route.ts')
  const post = handlerBody(source, 'POST')
  assert.match(post, /requireSpacesBbddMutation\s*\(\s*auth\s*,\s*['"]update['"]\s*\)/)
})
