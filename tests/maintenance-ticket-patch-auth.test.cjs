const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canActorMutateMaintenanceTicket,
} = require('../src/lib/maintenanceTicketPatchAuth')

test('managers and inbox operators can mutate any ticket', () => {
  assert.equal(
    canActorMutateMaintenanceTicket({
      role: 'usuari',
      userId: 'u1',
      assignedToIds: [],
      canManageTickets: true,
      canManageInbox: false,
    }),
    true
  )
  assert.equal(
    canActorMutateMaintenanceTicket({
      role: 'usuari',
      userId: 'u1',
      assignedToIds: [],
      canManageTickets: false,
      canManageInbox: true,
    }),
    true
  )
})

test('assigned treballador can mutate (journey updates)', () => {
  assert.equal(
    canActorMutateMaintenanceTicket({
      role: 'treballador',
      userId: 'worker-1',
      assignedToIds: ['worker-1', 'other'],
      canManageTickets: false,
      canManageInbox: false,
    }),
    true
  )
})

test('unassigned treballador cannot mutate', () => {
  assert.equal(
    canActorMutateMaintenanceTicket({
      role: 'treballador',
      userId: 'worker-1',
      assignedToIds: ['other'],
      canManageTickets: false,
      canManageInbox: false,
    }),
    false
  )
})

test('Qualitat / reporter view-only roles cannot mutate (read-only regression)', () => {
  for (const user of [
    { role: 'usuari', userId: 'q1', department: 'qualitat' },
    { role: 'cap', userId: 'q2', department: 'qualitat' },
    { role: 'usuari', userId: 's1', department: 'serveis' },
  ]) {
    assert.equal(
      canActorMutateMaintenanceTicket({
        role: user.role,
        userId: user.userId,
        assignedToIds: ['someone-else'],
        canManageTickets: false,
        canManageInbox: false,
      }),
      false,
      `expected deny for ${user.department} ${user.role}`
    )
  }
})

test('Qualitat treballador still cannot mutate unless assigned', () => {
  assert.equal(
    canActorMutateMaintenanceTicket({
      role: 'treballador',
      userId: 'q-worker',
      assignedToIds: [],
      canManageTickets: false,
      canManageInbox: false,
    }),
    false
  )
})
