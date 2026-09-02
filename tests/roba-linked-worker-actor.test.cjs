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
    request === '@/lib/server/apiAuth' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]apiAuth\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { requireAuth: async () => ({ ok: false }), requireRoles: () => null }
  }
  if (
    request === '@/lib/server/permissions' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]permissions\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return {
      canEditUiPath: async () => false,
      canViewUiPath: async () => false,
      isUiPermissionGranted: async () => false,
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { robaLinkedWorkerActor } = require('../src/lib/roba-personal/guard')

after(() => {
  Module._load = originalLoad
})

test('robaLinkedWorkerActor returns the workerSelf identity as-is', () => {
  assert.deepEqual(
    robaLinkedWorkerActor({
      scope: 'workerSelf',
      userId: 'u-worker',
      role: 'treballador',
      linkedPersonnelId: 'p-1',
      workerDeptNorm: 'cuina',
    }),
    {
      userId: 'u-worker',
      linkedPersonnelId: 'p-1',
      workerDeptNorm: 'cuina',
    }
  )
})

test('robaLinkedWorkerActor allows a dept lead only when personnel and department are set', () => {
  assert.deepEqual(
    robaLinkedWorkerActor({
      scope: 'deptLead',
      userId: 'u-lead',
      role: 'cap',
      leadDeptNorm: 'cuina',
      linkedPersonnelId: 'p-lead',
      workerDeptNorm: 'cuina',
    }),
    {
      userId: 'u-lead',
      linkedPersonnelId: 'p-lead',
      workerDeptNorm: 'cuina',
    }
  )

  assert.equal(
    robaLinkedWorkerActor({
      scope: 'deptLead',
      userId: 'u-lead',
      role: 'cap',
      leadDeptNorm: 'cuina',
    }),
    null
  )
  assert.equal(
    robaLinkedWorkerActor({
      scope: 'deptLead',
      userId: 'u-lead',
      role: 'cap',
      leadDeptNorm: 'cuina',
      linkedPersonnelId: '   ',
      workerDeptNorm: 'cuina',
    }),
    null
  )
  assert.equal(
    robaLinkedWorkerActor({
      scope: 'deptLead',
      userId: 'u-lead',
      role: 'cap',
      leadDeptNorm: 'cuina',
      linkedPersonnelId: 'p-lead',
      workerDeptNorm: '  ',
    }),
    null
  )
})

test('robaLinkedWorkerActor does not treat full admin/RRHH access as a worker actor', () => {
  assert.equal(
    robaLinkedWorkerActor({
      scope: 'full',
      userId: 'u-admin',
      role: 'admin',
    }),
    null
  )
})
