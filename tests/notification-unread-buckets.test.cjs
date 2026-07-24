const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (isFirebaseAdminModule(request)) {
    return { firestoreAdmin: {} }
  }
  if (request === 'firebase-admin/firestore') {
    return { FieldValue: { increment: (n) => ({ __increment: n }) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let bucketForNotificationType
let UNREAD_COUNTS_VERSION
try {
  ;({
    bucketForNotificationType,
    UNREAD_COUNTS_VERSION,
  } = require('../src/lib/notifications/unreadCounts'))
} finally {
  Module._load = originalLoad
}

test('bucketForNotificationType maps known notification families', () => {
  assert.equal(bucketForNotificationType('user_request'), 'user_request')
  assert.equal(bucketForNotificationType('user_request_result'), 'user_request_result')
  assert.equal(bucketForNotificationType('NEW_SHIFTS'), 'torn')
  assert.equal(bucketForNotificationType('project_task_assignment'), 'projects')
  assert.equal(bucketForNotificationType('commercial_vehicle_request'), 'logistics')
  assert.equal(bucketForNotificationType('event_comanda_warehouse'), 'events')
  assert.equal(bucketForNotificationType('event_comanda_batch_sent'), 'events')
  assert.equal(bucketForNotificationType('maintenance_ticket_assigned'), 'maintenance')
  assert.equal(bucketForNotificationType('incident_action_assigned'), 'incidents')
})

test('bucketForNotificationType ignores blank and unknown types', () => {
  assert.equal(bucketForNotificationType(''), null)
  assert.equal(bucketForNotificationType('   '), null)
  assert.equal(bucketForNotificationType('unknown_type'), null)
  assert.equal(UNREAD_COUNTS_VERSION, 2)
})
