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
const {
  preparationWarehousePerm,
} = require('../src/lib/logistics/preparationPermissions')

beforeEach(() => {
  userDocs = {}
  assignmentDocs = {}
})

function warehouseAllow(warehouse, extra = {}) {
  return {
    permission: preparationWarehousePerm(warehouse),
    effect: 'allow',
    scope: 'client',
    ...extra,
  }
}

test('admin and direcció sessions see every preparation warehouse without assignments', async () => {
  assert.deepEqual(await listPreparationWarehousesForUser('missing', 'admin'), [
    'BODEGA',
    'PARAMENT',
    'MATERIAL',
  ])
  assert.deepEqual(await listPreparationWarehousesForUser('missing', 'Direcció'), [
    'BODEGA',
    'PARAMENT',
    'MATERIAL',
  ])
})

test('cap is not a warehouse manager: missing user or no explicit allows yield no warehouses', async () => {
  assert.deepEqual(await listPreparationWarehousesForUser('cap-missing', 'cap'), [])

  userDocs['cap-1'] = { role: 'cap', department: 'logistica' }
  assert.deepEqual(await listPreparationWarehousesForUser('cap-1', 'cap'), [])
  assert.deepEqual(await listPreparationWarehousesForUser('cap-1', 'Cap Departament'), [])
})

test('logistics caps only receive warehouses with an explicit client allow override', async () => {
  userDocs['cap-1'] = { role: 'cap', department: 'logistica' }
  assignmentDocs['cap-1'] = {
    overrides: [
      warehouseAllow('BODEGA'),
      {
        permission: preparationWarehousePerm('PARAMENT'),
        effect: 'deny',
        scope: 'client',
      },
      warehouseAllow('MATERIAL', { scope: 'project', scopeId: 'p1' }),
    ],
  }

  assert.deepEqual(await listPreparationWarehousesForUser('cap-1', 'cap'), ['BODEGA'])
})

test('warehouse allows are ignored when the user cannot view Preparació', async () => {
  userDocs['cap-cuina'] = { role: 'cap', department: 'cuina' }
  assignmentDocs['cap-cuina'] = {
    overrides: [warehouseAllow('BODEGA'), warehouseAllow('PARAMENT')],
  }
  assert.deepEqual(await listPreparationWarehousesForUser('cap-cuina', 'cap'), [])

  assignmentDocs['cap-cuina'] = {
    overrides: [
      {
        permission: 'ui:view:/menu/logistica/preparacio',
        effect: 'allow',
        scope: 'client',
      },
      warehouseAllow('PARAMENT'),
    ],
  }
  assert.deepEqual(await listPreparationWarehousesForUser('cap-cuina', 'cap'), ['PARAMENT'])
})

test('workers with Preparació view still need per-warehouse allows; Deny casing does not grant', async () => {
  userDocs['w-1'] = { role: 'treballador', department: 'logistica' }
  assignmentDocs['w-1'] = {
    overrides: [
      warehouseAllow('MATERIAL'),
      {
        permission: preparationWarehousePerm('BODEGA'),
        effect: 'Deny',
        scope: 'client',
      },
    ],
  }

  assert.deepEqual(await listPreparationWarehousesForUser('w-1', 'treballador'), ['MATERIAL'])
})
