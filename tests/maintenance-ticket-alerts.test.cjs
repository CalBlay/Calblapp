const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  STALE_TICKET_DAYS,
  normalizeTicketWorkflowStage,
  isTicketHandled,
  isTicketStaleAlert,
  isExternalizedAwaitingProvider,
  getLastExternalFollowUpAt,
  isExternalizedTicketStaleAlert,
} = require('../src/lib/maintenanceTicketAlerts')

const DAY_MS = 1000 * 60 * 60 * 24

test('normalizeTicketWorkflowStage maps known stages and defaults to tickets_inbox', () => {
  assert.equal(normalizeTicketWorkflowStage('Planner_Queue'), 'planner_queue')
  assert.equal(normalizeTicketWorkflowStage('EXTERNALIZED'), 'externalized')
  assert.equal(normalizeTicketWorkflowStage('resolved_admin'), 'resolved_admin')
  assert.equal(normalizeTicketWorkflowStage(''), 'tickets_inbox')
  assert.equal(normalizeTicketWorkflowStage('mystery'), 'tickets_inbox')
})

test('isTicketHandled treats externalized, done, assigned, or planned tickets as handled', () => {
  assert.equal(isTicketHandled({ externalized: true }), true)
  assert.equal(isTicketHandled({ status: 'Fet' }), true)
  assert.equal(isTicketHandled({ status: 'validat' }), true)
  assert.equal(isTicketHandled({ assignedToIds: ['w1'] }), true)
  assert.equal(
    isTicketHandled({ plannedStart: Date.now(), plannedEnd: Date.now() + DAY_MS }),
    true
  )
  assert.equal(isTicketHandled({ status: 'nou', assignedToIds: [] }), false)
  assert.equal(
    isTicketHandled({ plannedStart: Date.now(), plannedEnd: null }),
    false
  )
})

test('isTicketStaleAlert only flags unhandled inbox/planner tickets older than threshold', () => {
  const staleCreatedAt = Date.now() - STALE_TICKET_DAYS * DAY_MS - 60_000
  const freshCreatedAt = Date.now() - (STALE_TICKET_DAYS - 1) * DAY_MS

  assert.equal(
    isTicketStaleAlert({
      workflowStage: 'tickets_inbox',
      status: 'nou',
      createdAt: staleCreatedAt,
    }),
    true
  )
  assert.equal(
    isTicketStaleAlert({
      workflowStage: 'planner_queue',
      status: 'nou',
      createdAt: staleCreatedAt,
    }),
    true
  )
  assert.equal(
    isTicketStaleAlert({
      workflowStage: 'tickets_inbox',
      status: 'nou',
      createdAt: freshCreatedAt,
    }),
    false
  )
  assert.equal(
    isTicketStaleAlert({
      workflowStage: 'planned_internal',
      status: 'nou',
      createdAt: staleCreatedAt,
    }),
    false
  )
  assert.equal(
    isTicketStaleAlert({
      workflowStage: 'tickets_inbox',
      status: 'nou',
      createdAt: staleCreatedAt,
      assignedToIds: ['w1'],
    }),
    false
  )
})

test('isExternalizedAwaitingProvider excludes answered/closed/resolved tickets', () => {
  assert.equal(
    isExternalizedAwaitingProvider({
      externalized: true,
      externalStatus: 'sent',
      workflowStage: 'externalized',
      status: 'nou',
    }),
    true
  )
  assert.equal(
    isExternalizedAwaitingProvider({
      externalized: true,
      externalStatus: 'answered',
      workflowStage: 'externalized',
    }),
    false
  )
  assert.equal(
    isExternalizedAwaitingProvider({
      externalized: true,
      externalStatus: 'sent',
      status: 'fet',
    }),
    false
  )
  assert.equal(
    isExternalizedAwaitingProvider({
      externalized: true,
      workflowStage: 'closed',
    }),
    false
  )
  assert.equal(
    isExternalizedAwaitingProvider({
      externalized: false,
      workflowStage: 'tickets_inbox',
    }),
    false
  )
})

test('getLastExternalFollowUpAt picks the newest follow-up timestamp', () => {
  const t1 = Date.now() - 5 * DAY_MS
  const t2 = Date.now() - 2 * DAY_MS
  const t3 = Date.now() - 1 * DAY_MS

  assert.equal(
    getLastExternalFollowUpAt({
      externalSentAt: t1,
      externalizationHistory: [{ at: t2 }],
      statusHistory: [{ at: t3 }],
      updatedAt: t1,
    }),
    t3
  )
  assert.equal(getLastExternalFollowUpAt({}), null)
})

test('isExternalizedTicketStaleAlert requires awaiting provider and stale follow-up', () => {
  const staleFollowUp = Date.now() - STALE_TICKET_DAYS * DAY_MS - 60_000
  const freshFollowUp = Date.now() - DAY_MS

  assert.equal(
    isExternalizedTicketStaleAlert({
      externalized: true,
      externalStatus: 'sent',
      workflowStage: 'externalized',
      status: 'nou',
      externalSentAt: staleFollowUp,
    }),
    true
  )
  assert.equal(
    isExternalizedTicketStaleAlert({
      externalized: true,
      externalStatus: 'sent',
      workflowStage: 'externalized',
      status: 'nou',
      externalSentAt: freshFollowUp,
    }),
    false
  )
  assert.equal(
    isExternalizedTicketStaleAlert({
      externalized: true,
      externalStatus: 'answered',
      workflowStage: 'externalized',
      externalSentAt: staleFollowUp,
    }),
    false
  )
})
