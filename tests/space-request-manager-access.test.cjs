const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
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
    return { isUiPermissionGranted: async () => false }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const { PERM } = require('../src/lib/permissionKeys')
const {
  SPACES_ACTION,
  SPACES_BBDD_PATH,
  SPACES_LEGACY_CONSULTA_ACTION,
  SPACES_REQUESTS_MANAGE_PERM,
  SPACES_UI_PATH,
} = require('../src/lib/spacesPermissions')
const { hasEffectiveSpaceRequestManagerAccess } = require('../src/lib/spaces/spaceRequests.server')
const { channelToSidebarItem } = require('../src/lib/messaging/channelSidebarItems')

function override(permission, effect = 'allow', extra = {}) {
  return { permission, effect, scope: 'client', scopeId: null, ...extra }
}

function assignment(...overrides) {
  return { overrides }
}

const MANAGE_ALLOW = override(SPACES_REQUESTS_MANAGE_PERM)

test('admins are space-request managers even without the explicit Ops allow', () => {
  assert.equal(hasEffectiveSpaceRequestManagerAccess({ role: 'admin' }, null), true)
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      { role: 'admin', department: 'serveis' },
      assignment(override(SPACES_REQUESTS_MANAGE_PERM, 'deny'))
    ),
    true
  )
})

test('direcció and caps need an exact client allow on requests:manage', () => {
  const direcció = { role: 'Direcció', department: 'serveis' }
  const cap = { role: 'cap', department: 'logistica' }

  assert.equal(hasEffectiveSpaceRequestManagerAccess(direcció, null), false)
  assert.equal(hasEffectiveSpaceRequestManagerAccess(cap, assignment()), false)
  assert.equal(hasEffectiveSpaceRequestManagerAccess(cap, assignment(MANAGE_ALLOW)), true)
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      cap,
      assignment(override(SPACES_REQUESTS_MANAGE_PERM, 'Deny'))
    ),
    false
  )
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      cap,
      assignment(override(SPACES_REQUESTS_MANAGE_PERM, 'allow', { scope: 'project', scopeId: 'p1' }))
    ),
    false
  )
})

test('space-request managers still need BBDD view and edit, and must not be denied create/update', () => {
  const cap = { role: 'cap', department: 'logistica' }

  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      cap,
      assignment(MANAGE_ALLOW, override(PERM.view(SPACES_BBDD_PATH), 'deny'))
    ),
    false
  )
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      cap,
      assignment(MANAGE_ALLOW, override(PERM.edit(SPACES_BBDD_PATH), 'deny'))
    ),
    false
  )
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      cap,
      assignment(
        MANAGE_ALLOW,
        override(PERM.action(SPACES_BBDD_PATH, SPACES_ACTION.BBDD_CREATE), 'deny')
      )
    ),
    false
  )
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      cap,
      assignment(
        MANAGE_ALLOW,
        override(PERM.view(SPACES_BBDD_PATH), 'deny'),
        override(PERM.action(SPACES_UI_PATH, SPACES_LEGACY_CONSULTA_ACTION.BBDD), 'allow')
      )
    ),
    true
  )
})

test('workers need an explicit BBDD edit allow in addition to requests:manage', () => {
  const worker = { role: 'treballador', department: 'produccio' }
  assert.equal(hasEffectiveSpaceRequestManagerAccess(worker, assignment(MANAGE_ALLOW)), false)
  assert.equal(
    hasEffectiveSpaceRequestManagerAccess(
      worker,
      assignment(MANAGE_ALLOW, override(PERM.edit(SPACES_BBDD_PATH), 'allow'))
    ),
    true
  )
})

test('space request channels surface Catalan status and requester in the Ops sidebar', () => {
  const reviewing = channelToSidebarItem({
    id: 'ch-1',
    source: 'spaces',
    name: 'fallback',
    location: 'Nou espai · Sala',
    requestStatus: 'in_review',
    requesterUserName: 'Marta',
    unreadCount: 2,
    status: 'open',
    lastMessagePreview: 'Hola',
  })
  assert.equal(reviewing.label, 'Nou espai · Sala')
  assert.equal(reviewing.meta, 'En revisió · Marta')
  assert.equal(reviewing.closed, false)

  const applied = channelToSidebarItem({
    id: 'ch-2',
    source: 'spaces',
    name: 'Petició',
    requestStatus: 'applied',
    unreadCount: 0,
    status: 'archived',
  })
  assert.equal(applied.meta, 'Aplicada')
  assert.equal(applied.closed, true)

  const unknown = channelToSidebarItem({
    id: 'ch-3',
    source: 'spaces',
    name: 'Petició',
    requestStatus: 'nope',
    unreadCount: 0,
  })
  assert.equal(unknown.meta, 'Pendent')
})
