const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isMaintenanceTicketResolved,
  isMaintenanceTicketPlanned,
  canCreatorDeleteMaintenanceTicket,
  canUserDeleteMaintenanceTicket,
} = require('../src/lib/maintenanceTicketDeletePolicy')

test('resolved tickets include closed statuses and workflow stages', () => {
  assert.equal(isMaintenanceTicketResolved({ status: 'fet' }), true)
  assert.equal(isMaintenanceTicketResolved({ status: 'Resolut' }), true)
  assert.equal(isMaintenanceTicketResolved({ status: 'no_fet' }), true)
  assert.equal(isMaintenanceTicketResolved({ status: 'validat' }), true)
  assert.equal(isMaintenanceTicketResolved({ workflowStage: 'resolved_admin' }), true)
  assert.equal(isMaintenanceTicketResolved({ workflowStage: 'resolved_planner' }), true)
  assert.equal(isMaintenanceTicketResolved({ workflowStage: 'closed' }), true)
  assert.equal(isMaintenanceTicketResolved({ status: 'nou', workflowStage: 'tickets_inbox' }), false)
})

test('planned tickets include assignment, schedule slot, and externalization', () => {
  assert.equal(isMaintenanceTicketPlanned({ externalized: true }), true)
  assert.equal(isMaintenanceTicketPlanned({ workflowStage: 'planned_internal' }), true)
  assert.equal(isMaintenanceTicketPlanned({ workflowStage: 'externalized' }), true)
  assert.equal(isMaintenanceTicketPlanned({ assignedToIds: ['tech-1'] }), true)
  assert.equal(
    isMaintenanceTicketPlanned({ plannedStart: 100, plannedEnd: 200 }),
    true
  )
  assert.equal(
    isMaintenanceTicketPlanned({ plannedStart: 100, plannedEnd: null }),
    false
  )
  assert.equal(
    isMaintenanceTicketPlanned({ status: 'nou', workflowStage: 'tickets_inbox' }),
    false
  )
})

test('creators can delete only unplanned open tickets', () => {
  const open = { status: 'nou', workflowStage: 'tickets_inbox', createdById: 'u-1' }
  assert.equal(canCreatorDeleteMaintenanceTicket(open), true)
  assert.equal(canUserDeleteMaintenanceTicket(open, 'u-1'), true)
  assert.equal(canUserDeleteMaintenanceTicket(open, 'u-2'), false)

  assert.equal(
    canCreatorDeleteMaintenanceTicket({ ...open, assignedToIds: ['tech-1'] }),
    false
  )
  assert.equal(
    canUserDeleteMaintenanceTicket({ ...open, status: 'fet' }, 'u-1'),
    false
  )
  assert.equal(
    canUserDeleteMaintenanceTicket({ ...open, workflowStage: 'closed' }, 'u-1'),
    false
  )
})
