const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

let session = null
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
  return originalLoad.call(this, request, parent, isMain)
}

const { requireCuinaCentralAdmin } = require('../src/lib/cuina-central/auth')

after(() => {
  Module._load = originalLoad
})

test('requireCuinaCentralAdmin returns 401 when there is no session user', async () => {
  session = null
  const denied = await requireCuinaCentralAdmin()
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 401)
  const body = await denied.res.json()
  assert.equal(body.error, 'No autoritzat')
})

test('requireCuinaCentralAdmin returns 403 for direcció, cap, and other non-admin roles', async () => {
  for (const role of ['direccio', 'Direcció', 'cap', 'treballador', 'usuari']) {
    session = { user: { id: 'u-1', role } }
    const denied = await requireCuinaCentralAdmin()
    assert.equal(denied.ok, false, `expected deny for role ${role}`)
    assert.equal(denied.res.status, 403)
    const body = await denied.res.json()
    assert.equal(body.error, 'Accés restringit a administradors')
  }
})

test('requireCuinaCentralAdmin allows admin (including Admin alias)', async () => {
  session = { user: { id: 'admin-1', name: 'Oriol', role: 'Admin' } }
  const allowed = await requireCuinaCentralAdmin()
  assert.equal(allowed.ok, true)
  assert.equal(allowed.user.id, 'admin-1')
  assert.equal(allowed.user.role, 'Admin')
})
