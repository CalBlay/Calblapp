const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isIncidentActionAssignedToUser,
  isIncidentActionNotificationVisible,
  summarizeIncidentActionProgress,
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
  assert.equal(
    isIncidentActionNotificationVisible(
      { type: 'incident_action_completed', actionId: 'action-2' },
      assignedIds
    ),
    true
  )
})

test('incident action progress counts completed actions and unique assignees', () => {
  assert.deepEqual(
    summarizeIncidentActionProgress([
      { status: 'done', assignedToName: 'Anna' },
      { status: 'open', assignedToName: 'Anna' },
      { status: 'in_progress', assignedToName: 'Bernat' },
    ]),
    { total: 3, done: 1, assignees: ['Anna', 'Bernat'] }
  )
})
