const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isIncidentActionAssignedToUser,
  isIncidentActionNotificationVisible,
} = require('../src/lib/incidentActionsMine')

test('incident action assignment uses id as the authoritative identity', () => {
  const user = { id: 'user-1', name: 'Gloria Rodriguez' }
  assert.equal(
    isIncidentActionAssignedToUser(
      { assignedToId: 'user-1', assignedToName: 'Gloria Rodriguez' },
      user
    ),
    true
  )
  assert.equal(
    isIncidentActionAssignedToUser(
      { assignedToId: 'other-user', assignedToName: 'Gloria Rodriguez' },
      user
    ),
    false
  )
  assert.equal(
    isIncidentActionAssignedToUser({ assignedToName: 'Gloria Rodriguez' }, user),
    true
  )
})

test('action notifications are visible only while the action is assigned to the user', () => {
  const assignedIds = new Set(['action-1'])
  assert.equal(
    isIncidentActionNotificationVisible(
      { type: 'incident_action_assigned', actionId: 'action-1' },
      assignedIds
    ),
    true
  )
  assert.equal(
    isIncidentActionNotificationVisible(
      { type: 'incident_action_assigned', actionId: 'action-2' },
      assignedIds
    ),
    false
  )
  assert.equal(
    isIncidentActionNotificationVisible({ type: 'incident_marketing_9xx_new' }, assignedIds),
    true
  )
})
