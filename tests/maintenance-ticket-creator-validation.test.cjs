const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canCapValidateMaintenanceTicket,
  canCreatorValidateMaintenanceTicket,
  maintenanceTicketRequiresCreatorValidation,
} = require('../src/lib/maintenanceTicketValidation')

test('creator feedback is optional after a ticket is marked done', () => {
  const ticket = {
    status: 'fet',
    createdById: 'creator-1',
    workflowStage: 'planned_internal',
    requiresCreatorValidation: true,
  }
  assert.equal(maintenanceTicketRequiresCreatorValidation(ticket), false)
  assert.equal(canCreatorValidateMaintenanceTicket(ticket, 'creator-1'), true)
  assert.equal(canCreatorValidateMaintenanceTicket(ticket, 'another-user'), false)
})

test('department validation can still close a done ticket when the creator has not answered', () => {
  const ticket = { status: 'fet', createdById: 'creator-1' }
  assert.equal(
    canCapValidateMaintenanceTicket(ticket, { role: 'admin', isMaintenanceCap: true }),
    true
  )
})
