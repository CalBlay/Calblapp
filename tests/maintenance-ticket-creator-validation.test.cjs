const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  CREATOR_REOPEN_WINDOW_MS,
  canCapValidateMaintenanceTicket,
  canCreatorRejectMaintenanceTicket,
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

test('creator can reopen a ticket after maintenance has validated it', () => {
  const now = Date.UTC(2026, 8, 12, 10, 0, 0)
  const ticket = {
    status: 'validat',
    createdById: 'creator-1',
    creatorValidatedAt: null,
    capValidatedAt: now - CREATOR_REOPEN_WINDOW_MS,
  }

  assert.equal(canCreatorValidateMaintenanceTicket(ticket, 'creator-1'), false)
  assert.equal(canCreatorRejectMaintenanceTicket(ticket, 'creator-1', now), true)
  assert.equal(canCreatorRejectMaintenanceTicket(ticket, 'another-user', now), false)
})

test('creator cannot reopen a validated ticket after seven days', () => {
  const now = Date.UTC(2026, 8, 12, 10, 0, 0)
  const expiredTicket = {
    status: 'validat',
    createdById: 'creator-1',
    capValidatedAt: now - CREATOR_REOPEN_WINDOW_MS - 1,
  }

  assert.equal(canCreatorRejectMaintenanceTicket(expiredTicket, 'creator-1', now), false)
  assert.equal(
    canCreatorRejectMaintenanceTicket(
      { status: 'validat', createdById: 'creator-1' },
      'creator-1',
      now
    ),
    false
  )
})

test('department validation can still close a done ticket when the creator has not answered', () => {
  const ticket = { status: 'fet', createdById: 'creator-1' }
  assert.equal(
    canCapValidateMaintenanceTicket(ticket, { role: 'admin', isMaintenanceCap: true }),
    true
  )
})
