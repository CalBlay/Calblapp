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

const {
  canViewQualitatCuinaCentralMaintenanceTickets,
} = require('../src/lib/server/maintenanceTicketsAccess')

test('Qualitat staff get the Cuina Central ticket scope; admin and direcció never do', () => {
  assert.equal(
    canViewQualitatCuinaCentralMaintenanceTickets({
      id: 'q-1',
      role: 'usuari',
      department: 'Qualitat',
    }),
    true
  )
  assert.equal(
    canViewQualitatCuinaCentralMaintenanceTickets({
      id: 'q-2',
      role: 'cap',
      department: 'qualitat',
    }),
    true
  )
  assert.equal(
    canViewQualitatCuinaCentralMaintenanceTickets({
      id: 'a-1',
      role: 'admin',
      department: 'qualitat',
    }),
    false
  )
  assert.equal(
    canViewQualitatCuinaCentralMaintenanceTickets({
      id: 'd-1',
      role: 'Direcció',
      department: 'qualitat',
    }),
    false
  )
  assert.equal(
    canViewQualitatCuinaCentralMaintenanceTickets({
      id: 's-1',
      role: 'usuari',
      department: 'serveis',
    }),
    false
  )
  assert.equal(
    canViewQualitatCuinaCentralMaintenanceTickets({
      id: 'm-1',
      role: 'cap',
      department: 'manteniment',
    }),
    false
  )
})
