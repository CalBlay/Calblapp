const assert = require('node:assert/strict')
const { test } = require('node:test')

const { buildChannelPushUrl } = require('../src/lib/messaging/messagePush.server')
const { isTicketOpsActive } = require('../src/lib/messaging/ticketOpsStatus')

test('ticket Ops notifications open the matching module', () => {
  assert.equal(
    buildChannelPushUrl('channel-1', {
      source: 'maintenance_ticket',
      ticketId: 'ticket-1',
      ticketType: 'deco',
    }),
    '/menu/deco/tickets?ticketId=ticket-1&ops=1'
  )
  assert.equal(
    buildChannelPushUrl('channel-2', {
      source: 'maintenance_ticket',
      ticketId: 'ticket-2',
      ticketType: 'maquinaria',
    }),
    '/menu/manteniment/tickets?ticketId=ticket-2&ops=1'
  )
})

test('ticket Ops stays active while planned and closes with the ticket', () => {
  assert.equal(isTicketOpsActive({ workflowStage: 'tickets_inbox', status: 'nou' }), true)
  assert.equal(isTicketOpsActive({ workflowStage: 'planned_internal', status: 'assignat' }), true)
  assert.equal(isTicketOpsActive({ workflowStage: 'planner_queue', status: 'en_curs' }), true)
  assert.equal(isTicketOpsActive({ workflowStage: 'resolved_planner', status: 'fet' }), false)
  assert.equal(isTicketOpsActive({ workflowStage: 'tickets_inbox', externalized: true }), false)
  assert.equal(isTicketOpsActive({ workflowStage: 'Resolved_Admin', status: 'assignat' }), false)
  assert.equal(isTicketOpsActive({ workflowStage: 'closed', status: 'nou' }), false)
  assert.equal(isTicketOpsActive({ workflowStage: 'tickets_inbox', status: 'Validat' }), false)
  assert.equal(isTicketOpsActive({}), true)
})
