const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, beforeEach, test } = require('node:test')

let userDocs = {}
let assignmentDocs = {}

function makeFirestore() {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          const store = name === 'users' ? userDocs : assignmentDocs
          const data = store[id]
          if (data === undefined) {
            return { exists: false, data: () => ({}) }
          }
          return { exists: true, data: () => data }
        },
      }),
    }),
  }
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: makeFirestore() }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const {
  listPreparationWarehousesForUser,
} = require('../src/lib/logistics/preparationAccess.server')

beforeEach(() => {
  userDocs = {}
  assignmentDocs = {}
})

const ALL_WAREHOUSES = ['BODEGA', 'PARAMENT', 'MATERIAL', 'DECO']
const DECO_SCOPE = { scope: 'deco' }

test('admin deco scope still returns every warehouse; direcció skips the manager shortcut', async () => {
  assert.deepEqual(
    await listPreparationWarehousesForUser('missing', 'admin', DECO_SCOPE),
    ALL_WAREHOUSES
  )
  assert.deepEqual(
    await listPreparationWarehousesForUser('missing', 'Direcció', DECO_SCOPE),
    []
  )
})

test('direcció with Deco preparation view only receives the DECO warehouse', async () => {
  userDocs['dir-1'] = { role: 'direccio', department: 'serveis' }
  assert.deepEqual(
    await listPreparationWarehousesForUser('dir-1', 'direccio', DECO_SCOPE),
    ['DECO']
  )
})

test('Deco staff with preparation view receive DECO; logistics prep view does not leak into deco scope', async () => {
  userDocs['deco-w'] = { role: 'treballador', department: 'Decoració' }
  assert.deepEqual(
    await listPreparationWarehousesForUser('deco-w', 'treballador', DECO_SCOPE),
    ['DECO']
  )

  userDocs['log-cap'] = { role: 'cap', department: 'logistica' }
  assignmentDocs['log-cap'] = {
    overrides: [
      {
        permission: 'ui:view:/menu/logistica/preparacio',
        effect: 'allow',
        scope: 'client',
      },
    ],
  }
  assert.deepEqual(await listPreparationWarehousesForUser('log-cap', 'cap', DECO_SCOPE), [])
})

test('an explicit deny on Deco preparation hides the DECO warehouse', async () => {
  userDocs['deco-cap'] = { role: 'cap', department: 'deco' }
  assignmentDocs['deco-cap'] = {
    overrides: [
      {
        permission: 'ui:view:/menu/deco/preparacio',
        effect: 'deny',
        scope: 'client',
      },
    ],
  }
  assert.deepEqual(await listPreparationWarehousesForUser('deco-cap', 'cap', DECO_SCOPE), [])
})
