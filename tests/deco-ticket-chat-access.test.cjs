const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canAccessRestrictedDecoTicketChannel,
  isRestrictedDecoTicketChannel,
} = require('../src/lib/messaging/decoTicketChatAccess')

const decoChannel = {
  source: 'maintenance_ticket',
  ticketType: 'deco',
  requesterUserId: 'creator-1',
}

test('identifies only Deco maintenance-ticket channels as restricted', () => {
  assert.equal(isRestrictedDecoTicketChannel(decoChannel), true)
  assert.equal(
    isRestrictedDecoTicketChannel({ ...decoChannel, ticketType: 'maquinaria' }),
    false
  )
  assert.equal(isRestrictedDecoTicketChannel({ source: 'events', ticketType: 'deco' }), false)
})

test('allows the ticket creator and Deco personnel into a restricted Deco chat', () => {
  assert.equal(
    canAccessRestrictedDecoTicketChannel(decoChannel, {
      id: 'creator-1',
      department: 'Comercial',
    }),
    true
  )
  assert.equal(
    canAccessRestrictedDecoTicketChannel(decoChannel, {
      id: 'deco-1',
      department: 'Decoració',
    }),
    true
  )
})

test('denies non-Deco personnel even when their role could have global chat access', () => {
  assert.equal(
    canAccessRestrictedDecoTicketChannel(decoChannel, {
      id: 'admin-1',
      department: 'Administració',
    }),
    false
  )
  assert.equal(
    canAccessRestrictedDecoTicketChannel(decoChannel, {
      id: 'direction-1',
      department: 'Direcció',
    }),
    false
  )
})
