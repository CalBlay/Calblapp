const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isGestorResolvedMaintenanceTicket,
  maintenanceTicketRequiresCreatorValidation,
  isMaintenanceTicketPendingValidation,
  canCreatorValidateMaintenanceTicket,
  canCapValidateMaintenanceTicket,
  isMaintenanceTicketDualValidationComplete,
  getMaintenanceTicketValidationSummary,
} = require('../src/lib/maintenanceTicketValidation')

test('gestor-resolved tickets include resolved_admin and administracio area', () => {
  assert.equal(isGestorResolvedMaintenanceTicket({ workflowStage: 'resolved_admin' }), true)
  assert.equal(
    isGestorResolvedMaintenanceTicket({ workflowStage: 'tickets_inbox', resolvedByArea: 'Administracio' }),
    true
  )
  assert.equal(
    isGestorResolvedMaintenanceTicket({ workflowStage: 'planned_internal', resolvedByArea: 'manteniment' }),
    false
  )
})

test('creator validation is required for gestor-resolved or explicit flag', () => {
  assert.equal(
    maintenanceTicketRequiresCreatorValidation({ requiresCreatorValidation: true }),
    true
  )
  assert.equal(
    maintenanceTicketRequiresCreatorValidation({ workflowStage: 'resolved_admin' }),
    true
  )
  assert.equal(
    maintenanceTicketRequiresCreatorValidation({ workflowStage: 'tickets_inbox' }),
    false
  )
})

test('pending validation accepts fet and resolut aliases', () => {
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'fet' }), true)
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'Resolut' }), true)
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'validat' }), false)
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'en_curs' }), false)
})

test('only the creator can validate when dual validation is required', () => {
  const ticket = {
    status: 'fet',
    workflowStage: 'resolved_admin',
    createdById: 'u-creator',
  }

  assert.equal(canCreatorValidateMaintenanceTicket(ticket, 'u-creator'), true)
  assert.equal(canCreatorValidateMaintenanceTicket(ticket, 'u-other'), false)
  assert.equal(
    canCreatorValidateMaintenanceTicket({ ...ticket, creatorValidatedAt: 1 }, 'u-creator'),
    false
  )
  assert.equal(
    canCreatorValidateMaintenanceTicket({ ...ticket, status: 'validat' }, 'u-creator'),
    false
  )
  assert.equal(
    canCreatorValidateMaintenanceTicket(
      { status: 'fet', createdById: 'u-creator', workflowStage: 'tickets_inbox' },
      'u-creator'
    ),
    false
  )
})

test('cap/admin validation is gated by role and dual-validation state', () => {
  const dualTicket = {
    status: 'fet',
    workflowStage: 'resolved_admin',
    createdById: 'u-creator',
  }

  assert.equal(
    canCapValidateMaintenanceTicket(dualTicket, { role: 'admin', isMaintenanceCap: false }),
    true
  )
  assert.equal(
    canCapValidateMaintenanceTicket(dualTicket, { role: 'usuari', isMaintenanceCap: true }),
    true
  )
  assert.equal(
    canCapValidateMaintenanceTicket(dualTicket, { role: 'usuari', isMaintenanceCap: false }),
    false
  )
  assert.equal(
    canCapValidateMaintenanceTicket(
      { ...dualTicket, capValidatedAt: 99 },
      { role: 'admin', isMaintenanceCap: false }
    ),
    false
  )

  const simpleTicket = { status: 'fet', workflowStage: 'tickets_inbox' }
  assert.equal(
    canCapValidateMaintenanceTicket(simpleTicket, { role: 'admin', isMaintenanceCap: false }),
    true
  )
})

test('dual validation summary and completion flags', () => {
  const incomplete = {
    status: 'fet',
    workflowStage: 'resolved_admin',
    creatorValidatedAt: 1,
  }
  assert.equal(isMaintenanceTicketDualValidationComplete(incomplete), false)
  assert.deepEqual(getMaintenanceTicketValidationSummary(incomplete), {
    requiresCreatorValidation: true,
    creatorDone: true,
    capDone: false,
    pendingCreator: false,
    pendingCap: true,
  })

  const complete = {
    ...incomplete,
    capValidatedAt: 2,
  }
  assert.equal(isMaintenanceTicketDualValidationComplete(complete), true)

  const simplePending = { status: 'fet', workflowStage: 'tickets_inbox' }
  assert.equal(isMaintenanceTicketDualValidationComplete(simplePending), false)
  assert.deepEqual(getMaintenanceTicketValidationSummary(simplePending), {
    requiresCreatorValidation: false,
    creatorDone: false,
    capDone: false,
    pendingCreator: false,
    pendingCap: true,
  })
})
