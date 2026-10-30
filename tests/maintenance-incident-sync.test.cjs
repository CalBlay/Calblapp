const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildReopenedIncidentPatch,
  buildResolvedIncidentPatch,
} = require('../src/lib/maintenanceIncidentSync')

test('resolving a linked maintenance ticket marks the incident as resolved', () => {
  const patch = buildResolvedIncidentPatch({
    ticketId: 'ticket-1',
    ticketCode: 'INC-0042',
    resolvedAt: 123456,
    resolvedById: 'user-1',
    resolvedByName: 'Responsable manteniment',
    resolutionNote: 'S’ha substituït la peça.',
  })

  assert.deepEqual(patch, {
    status: 'resolt',
    resolutionNote: 'S’ha substituït la peça.',
    resolvedAt: 123456,
    resolvedById: 'user-1',
    resolvedByName: 'Responsable manteniment',
    maintenanceTicketId: 'ticket-1',
    maintenanceTicketCode: 'INC-0042',
    resolvedFromMaintenanceTicket: true,
    updatedAt: 123456,
  })
})

test('incident sync provides a useful fallback resolution note', () => {
  const patch = buildResolvedIncidentPatch({
    ticketId: 'ticket-2',
    ticketCode: 'INC-0099',
    resolvedAt: 789,
  })

  assert.equal(patch.status, 'resolt')
  assert.equal(patch.resolutionNote, 'Ticket INC-0099 resolt des del mòdul de manteniment.')
})

test('rejecting the ticket resolution returns the incident to in progress', () => {
  const patch = buildReopenedIncidentPatch({
    ticketId: 'ticket-1',
    reopenedAt: 456,
    reopenedById: 'creator-1',
    reopenedByName: 'Responsable sala',
    reason: 'La reparació no és correcta',
  })

  assert.equal(patch.status, 'en_curs')
  assert.equal(patch.resolvedAt, null)
  assert.equal(patch.resolutionNote, 'Resolució rebutjada: La reparació no és correcta')
})
