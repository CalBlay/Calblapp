const assert = require('node:assert/strict')
const Module = require('node:module')
const { test, beforeEach, after } = require('node:test')

let userDocs = {}

function makeFirestore() {
  return {
    collection: () => ({
      doc: (userId) => ({
        get: async () => {
          const data = userDocs[userId]
          if (data === undefined) {
            return { exists: false, data: () => ({}) }
          }
          return { exists: true, data: () => data }
        },
      }),
    }),
  }
}

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (isFirebaseAdminModule(request)) {
    return { firestoreAdmin: makeFirestore() }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const {
  userCanMarkRequestPrepared,
  userCanMarkRequestPickedUp,
} = require('../src/lib/roba-personal/requestPermissions')

beforeEach(() => {
  userDocs = {}
})

test('userCanMarkRequestPrepared allows admins and Recursos Humans only', async () => {
  userDocs.u1 = { department: 'Recursos Humans' }
  userDocs.u2 = { department: 'Cuina' }

  assert.equal(await userCanMarkRequestPrepared('u2', 'admin'), true)
  assert.equal(await userCanMarkRequestPrepared('u1', 'treballador'), true)
  assert.equal(await userCanMarkRequestPrepared('u2', 'cap'), false)
  assert.equal(await userCanMarkRequestPrepared('missing', 'treballador'), false)
})

test('userCanMarkRequestPickedUp rejects empty user ids even for admins', async () => {
  assert.equal(await userCanMarkRequestPickedUp('', { requestingDepartment: 'cuina' }, 'admin'), false)
})

test('userCanMarkRequestPickedUp allows admins without a department match', async () => {
  assert.equal(
    await userCanMarkRequestPickedUp(
      'admin-1',
      { requestingDepartment: 'cuina' },
      'admin'
    ),
    true
  )
})

test('userCanMarkRequestPickedUp requires a same-department roba lead', async () => {
  userDocs.lead = {
    isDepartmentRobaLead: true,
    department: 'Cúina',
  }
  userDocs.otherLead = {
    isDepartmentRobaLead: true,
    department: 'Sala',
  }
  userDocs.worker = {
    isDepartmentRobaLead: false,
    department: 'Cuina',
  }

  const request = { requestingDepartment: 'Cuina' }

  assert.equal(await userCanMarkRequestPickedUp('lead', request, 'cap'), true)
  assert.equal(await userCanMarkRequestPickedUp('otherLead', request, 'cap'), false)
  assert.equal(await userCanMarkRequestPickedUp('worker', request, 'treballador'), false)
  assert.equal(await userCanMarkRequestPickedUp('missing', request, 'cap'), false)
})

test('userCanMarkRequestPickedUp does not treat cuina and cuina central as the same dept', async () => {
  userDocs.lead = {
    isDepartmentRobaLead: true,
    department: 'Cuina',
  }
  assert.equal(
    await userCanMarkRequestPickedUp(
      'lead',
      { requestingDepartment: 'Cuina Central' },
      'cap'
    ),
    false
  )
})

test('userCanMarkRequestPickedUp ignores linkedPersonnelId', async () => {
  userDocs.worker = {
    isDepartmentRobaLead: false,
    department: 'Cuina',
  }
  assert.equal(
    await userCanMarkRequestPickedUp(
      'worker',
      { requestingDepartment: 'Cuina', requestedByWorkerId: 'p-1' },
      'treballador',
      { linkedPersonnelId: 'p-1' }
    ),
    false
  )
})
