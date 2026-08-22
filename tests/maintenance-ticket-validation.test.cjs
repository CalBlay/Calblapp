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

const gestorTicket = {
  status: 'fet',
  workflowStage: 'resolved_admin',
  createdById: 'creator-1',
}

test('isGestorResolvedMaintenanceTicket accepts resolved_admin stage or administracio area', () => {
  assert.equal(
    isGestorResolvedMaintenanceTicket({ workflowStage: 'resolved_admin' }),
    true
  )
  assert.equal(
    isGestorResolvedMaintenanceTicket({ resolvedByArea: 'Administracio' }),
    true
  )
  assert.equal(
    isGestorResolvedMaintenanceTicket({
      workflowStage: 'tickets_inbox',
      resolvedByArea: 'planner',
    }),
    false
  )
  // Accented area is not folded — only lowercased exact "administracio" matches.
  assert.equal(
    isGestorResolvedMaintenanceTicket({ resolvedByArea: 'Administració' }),
    false
  )
})

test('maintenanceTicketRequiresCreatorValidation honors explicit flag or gestor resolution', () => {
  assert.equal(
    maintenanceTicketRequiresCreatorValidation({ requiresCreatorValidation: true }),
    true
  )
  assert.equal(maintenanceTicketRequiresCreatorValidation(gestorTicket), true)
  assert.equal(
    maintenanceTicketRequiresCreatorValidation({
      status: 'fet',
      workflowStage: 'tickets_inbox',
    }),
    false
  )
})

test('isMaintenanceTicketPendingValidation treats fet and resolut as pending, not validat', () => {
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'Fet' }), true)
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'resolut' }), true)
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'validat' }), false)
  assert.equal(isMaintenanceTicketPendingValidation({ status: 'nou' }), false)
  assert.equal(isMaintenanceTicketPendingValidation({ status: '' }), false)
})

test('canCreatorValidateMaintenanceTicket requires matching creator, pending fet, and no prior stamp', () => {
  assert.equal(canCreatorValidateMaintenanceTicket(gestorTicket, 'creator-1'), true)

  assert.equal(canCreatorValidateMaintenanceTicket(gestorTicket, 'other'), false)
  assert.equal(canCreatorValidateMaintenanceTicket(gestorTicket, ''), false)
  assert.equal(
    canCreatorValidateMaintenanceTicket({ ...gestorTicket, createdById: '' }, 'creator-1'),
    false
  )
  assert.equal(
    canCreatorValidateMaintenanceTicket({ ...gestorTicket, status: 'validat' }, 'creator-1'),
    false
  )
  assert.equal(
    canCreatorValidateMaintenanceTicket({ ...gestorTicket, status: 'nou' }, 'creator-1'),
    false
  )
  assert.equal(
    canCreatorValidateMaintenanceTicket(
      { ...gestorTicket, creatorValidatedAt: Date.now() },
      'creator-1'
    ),
    false
  )
  assert.equal(
    canCreatorValidateMaintenanceTicket(
      { status: 'fet', createdById: 'creator-1', workflowStage: 'tickets_inbox' },
      'creator-1'
    ),
    false
  )
})

test('canCapValidateMaintenanceTicket allows admin/cap on pending tickets and blocks already-validat', () => {
  const capOk = { role: 'cap', isMaintenanceCap: true }
  const adminOk = { role: 'admin', isMaintenanceCap: false }
  const worker = { role: 'treballador', isMaintenanceCap: false }

  assert.equal(canCapValidateMaintenanceTicket({ status: 'fet' }, capOk), true)
  assert.equal(canCapValidateMaintenanceTicket({ status: 'fet' }, adminOk), true)
  assert.equal(canCapValidateMaintenanceTicket({ status: 'fet' }, worker), false)
  assert.equal(canCapValidateMaintenanceTicket({ status: 'validat' }, capOk), false)
  assert.equal(canCapValidateMaintenanceTicket({ status: 'nou' }, capOk), false)

  assert.equal(
    canCapValidateMaintenanceTicket(
      { ...gestorTicket, capValidatedAt: Date.now() },
      capOk
    ),
    false
  )
  assert.equal(canCapValidateMaintenanceTicket(gestorTicket, capOk), true)
})

test('dual validation is complete only when both stamps exist on a creator-required ticket', () => {
  assert.equal(
    isMaintenanceTicketDualValidationComplete({
      ...gestorTicket,
      creatorValidatedAt: 1,
      capValidatedAt: 2,
    }),
    true
  )
  assert.equal(
    isMaintenanceTicketDualValidationComplete({
      ...gestorTicket,
      creatorValidatedAt: 1,
    }),
    false
  )
  assert.equal(
    isMaintenanceTicketDualValidationComplete({
      status: 'fet',
      creatorValidatedAt: 1,
      capValidatedAt: 2,
    }),
    false
  )
})

test('getMaintenanceTicketValidationSummary reports pending creator/cap independently', () => {
  assert.deepEqual(getMaintenanceTicketValidationSummary({ status: 'fet' }), {
    requiresCreatorValidation: false,
    creatorDone: false,
    capDone: false,
    pendingCreator: false,
    pendingCap: true,
  })

  assert.deepEqual(
    getMaintenanceTicketValidationSummary({
      ...gestorTicket,
      creatorValidatedAt: 1,
    }),
    {
      requiresCreatorValidation: true,
      creatorDone: true,
      capDone: false,
      pendingCreator: false,
      pendingCap: true,
    }
  )

  assert.deepEqual(
    getMaintenanceTicketValidationSummary({
      ...gestorTicket,
      status: 'validat',
      creatorValidatedAt: 1,
      capValidatedAt: 2,
    }),
    {
      requiresCreatorValidation: true,
      creatorDone: true,
      capDone: true,
      pendingCreator: false,
      pendingCap: false,
    }
  )
})
