const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithServerOnlyStub(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {}, messagingAdmin: null }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { defaultPushUrlForNotificationType } = require('../src/lib/notifications/sendUserPush.server')

test('defaultPushUrlForNotificationType routes common types and encodes ids', () => {
  assert.equal(defaultPushUrlForNotificationType('user_request'), '/menu/users')
  assert.equal(defaultPushUrlForNotificationType('torn'), '/menu/torns')
  assert.equal(defaultPushUrlForNotificationType('quadrant_survey'), '/menu/sondeigs')
  assert.equal(defaultPushUrlForNotificationType('unknown_type'), '/menu')

  assert.equal(
    defaultPushUrlForNotificationType('project_task_assignment', { projectId: 'p/1' }),
    `/menu/projects/${encodeURIComponent('p/1')}`
  )
  assert.equal(defaultPushUrlForNotificationType('project_assignment'), '/menu/projects')

  assert.equal(
    defaultPushUrlForNotificationType('maintenance_ticket_assigned', { ticketId: 't&1' }),
    `/menu/manteniment/tickets?ticketId=${encodeURIComponent('t&1')}&ops=1`
  )
  assert.equal(
    defaultPushUrlForNotificationType('maintenance_ticket_new'),
    '/menu/manteniment/tickets'
  )

  assert.equal(
    defaultPushUrlForNotificationType('incident_action_assigned', { incidentId: 'i 1' }),
    `/menu/incidents?incidentId=${encodeURIComponent('i 1')}`
  )
  assert.equal(defaultPushUrlForNotificationType('incident_marketing_9xx_new'), '/menu/incidents')

  assert.equal(
    defaultPushUrlForNotificationType('commercial_vehicle_request'),
    '/menu/logistica/reserva-comercials?tab=validacio'
  )
  assert.equal(
    defaultPushUrlForNotificationType('roba_personal_ready'),
    '/menu/roba-personal'
  )
  assert.equal(
    defaultPushUrlForNotificationType('transport_review_due'),
    '/menu/logistica/transports'
  )
})

Module._load = originalLoad
