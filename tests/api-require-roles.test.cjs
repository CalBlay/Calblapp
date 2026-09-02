const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

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
  return originalLoad.call(this, request, parent, isMain)
}

const { requireRoles } = require('../src/lib/server/apiAuth')
const { requireEventComandaAdmin } = require('../src/lib/eventComanda/adminAccess')

after(() => {
  Module._load = originalLoad
})

function auth(role) {
  return {
    ok: true,
    session: {},
    user: { id: 'u-1', role },
    role,
  }
}

test('requireRoles returns 403 when the session role is not allowed', async () => {
  const denied = requireRoles(auth('cap'), ['admin', 'direccio'])
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)
  const body = await denied.res.json()
  assert.equal(body.error, 'Forbidden')
})

test('requireRoles returns null when the role is in the allow-list', () => {
  assert.equal(requireRoles(auth('admin'), ['admin']), null)
  assert.equal(requireRoles(auth('direccio'), ['admin', 'direccio']), null)
  assert.equal(requireRoles(auth('treballador'), ['treballador', 'cap']), null)
})

test('requireEventComandaAdmin is admin/direccio only', async () => {
  assert.equal(requireEventComandaAdmin(auth('admin')), null)
  assert.equal(requireEventComandaAdmin(auth('direccio')), null)
  const denied = requireEventComandaAdmin(auth('cap'))
  assert.equal(denied.ok, false)
  assert.equal(denied.res.status, 403)
})
