const assert = require('node:assert/strict')
const Module = require('node:module')
const { test, beforeEach } = require('node:test')

const deleteCalls = []
const upsertCalls = []
let userDocs = {}

function makeFirestore() {
  return {
    collection: () => ({
      doc: (userId) => ({
        get: async () => {
          const data = userDocs[userId]
          if (data === undefined) {
            return { exists: false, data: () => ({}) }
          }
          return { exists: true, data: () => data }
        },
      }),
    }),
  }
}

const firebaseAdminStub = {
  firestoreAdmin: makeFirestore(),
}

const graphCalendarStub = {
  deleteOutlookCalendarEvent: async (email, eventId) => {
    deleteCalls.push({ email, eventId })
  },
  upsertMaintenanceTicketCalendarEvent: async (input) => {
    upsertCalls.push({ ...input })
    return {
      id: input.eventId || `new-${input.assigneeEmail}`,
      webLink: 'https://outlook.test/event',
    }
  },
}

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

function isGraphCalendarModule(request) {
  return (
    request === '@/services/graph/calendar' ||
    /[\\/]src[\\/]services[\\/]graph[\\/]calendar\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') {
    return {}
  }
  if (isFirebaseAdminModule(request)) {
    return firebaseAdminStub
  }
  if (isGraphCalendarModule(request)) {
    return graphCalendarStub
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  syncMaintenanceTicketOutlookCalendar,
  toOutlookMadridDateTime,
} = require('../src/lib/maintenanceTicketOutlook')

const PLANNED_START = Date.parse('2024-01-15T10:00:00.000Z')
const PLANNED_END = Date.parse('2024-01-15T12:00:00.000Z')

beforeEach(() => {
  deleteCalls.length = 0
  upsertCalls.length = 0
  userDocs = {}
})

test('toOutlookMadridDateTime converts UTC instants to Europe/Madrid wall time', () => {
  assert.equal(
    toOutlookMadridDateTime(Date.parse('2024-01-15T10:00:00.000Z')),
    '2024-01-15T11:00:00'
  )
  assert.equal(
    toOutlookMadridDateTime(Date.parse('2024-07-15T10:00:00.000Z')),
    '2024-07-15T12:00:00'
  )
})

test('syncMaintenanceTicketOutlookCalendar clears existing events when clearPlanning is set', async () => {
  const existingEvents = {
    'user-1': { eventId: 'evt-1', email: 'one@test.com', role: 'assignee' },
    'user-2': { eventId: 'evt-2', email: 'two@test.com', role: 'creator' },
  }

  const result = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    existingEvents,
    clearPlanning: true,
  })

  assert.deepEqual(result, {})
  assert.equal(deleteCalls.length, 2)
  assert.deepEqual(deleteCalls, [
    { email: 'one@test.com', eventId: 'evt-1' },
    { email: 'two@test.com', eventId: 'evt-2' },
  ])
  assert.equal(upsertCalls.length, 0)
})

test('syncMaintenanceTicketOutlookCalendar is a no-op when planning is incomplete', async () => {
  const existingEvents = {
    'user-1': { eventId: 'evt-1', email: 'one@test.com', role: 'assignee' },
  }

  const missingAssignees = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    plannedStart: PLANNED_START,
    plannedEnd: PLANNED_END,
    assignedToIds: [],
    existingEvents,
  })
  assert.deepEqual(missingAssignees, existingEvents)

  const missingStart = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    plannedEnd: PLANNED_END,
    assignedToIds: ['user-1'],
    existingEvents,
  })
  assert.deepEqual(missingStart, existingEvents)

  const missingEnd = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    plannedStart: PLANNED_START,
    assignedToIds: ['user-1'],
    existingEvents,
  })
  assert.deepEqual(missingEnd, existingEvents)

  assert.equal(deleteCalls.length, 0)
  assert.equal(upsertCalls.length, 0)
})

test('syncMaintenanceTicketOutlookCalendar upserts creator and assignee events with Madrid datetimes', async () => {
  userDocs = {
    'creator-1': { email: 'creator@test.com', name: 'Creator' },
    'assignee-1': { email: 'assignee@test.com', name: 'Assignee' },
  }

  const result = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    ticketCode: 'MT-001',
    location: 'Nau A',
    machine: 'Linia 3',
    description: 'Revisio preventiva',
    createdById: 'creator-1',
    assignedToIds: ['assignee-1'],
    assignedToNames: ['Assignee'],
    plannedStart: PLANNED_START,
    plannedEnd: PLANNED_END,
  })

  assert.equal(upsertCalls.length, 2)
  assert.equal(deleteCalls.length, 0)
  assert.deepEqual(result, {
    'creator-1': {
      eventId: 'new-creator@test.com',
      email: 'creator@test.com',
      role: 'creator',
    },
    'assignee-1': {
      eventId: 'new-assignee@test.com',
      email: 'assignee@test.com',
      role: 'assignee',
    },
  })

  for (const call of upsertCalls) {
    assert.equal(call.startDateTime, '2024-01-15T11:00:00')
    assert.equal(call.endDateTime, '2024-01-15T13:00:00')
    assert.match(call.subject, /MT-001/)
    assert.match(call.bodyHtml, /MT-001/)
  }

  const creatorCall = upsertCalls.find((call) => call.assigneeEmail === 'creator@test.com')
  const assigneeCall = upsertCalls.find((call) => call.assigneeEmail === 'assignee@test.com')
  assert.match(creatorCall.subject, /Manteniment assignat/)
  assert.match(assigneeCall.subject, /Ticket manteniment/)
  assert.match(creatorCall.bodyHtml, /Operari/)
  assert.match(assigneeCall.bodyHtml, /Tens un ticket de manteniment assignat/)
})

test('syncMaintenanceTicketOutlookCalendar skips users without a valid mailbox', async () => {
  userDocs = {
    'missing-user': undefined,
    'blank-email': { email: '', name: 'Blank' },
    'invalid-email': { email: 'not-an-email', name: 'Invalid' },
    'valid-user': { email: 'valid@test.com', name: 'Valid' },
  }

  const result = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    assignedToIds: ['missing-user', 'blank-email', 'invalid-email', 'valid-user'],
    plannedStart: PLANNED_START,
    plannedEnd: PLANNED_END,
  })

  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].assigneeEmail, 'valid@test.com')
  assert.deepEqual(result, {
    'valid-user': {
      eventId: 'new-valid@test.com',
      email: 'valid@test.com',
      role: 'assignee',
    },
  })
})

test('syncMaintenanceTicketOutlookCalendar reuses eventId only when the stored email still matches', async () => {
  userDocs = {
    'user-1': { email: 'new@test.com', name: 'User' },
  }

  await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    assignedToIds: ['user-1'],
    plannedStart: PLANNED_START,
    plannedEnd: PLANNED_END,
    existingEvents: {
      'user-1': { eventId: 'evt-same-email', email: 'new@test.com', role: 'assignee' },
    },
  })

  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].eventId, 'evt-same-email')

  upsertCalls.length = 0

  await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    assignedToIds: ['user-1'],
    plannedStart: PLANNED_START,
    plannedEnd: PLANNED_END,
    existingEvents: {
      'user-1': { eventId: 'evt-old-email', email: 'old@test.com', role: 'assignee' },
    },
  })

  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].eventId, undefined)
})

test('syncMaintenanceTicketOutlookCalendar deletes stale event refs for removed users', async () => {
  userDocs = {
    'user-1': { email: 'one@test.com', name: 'One' },
  }

  const result = await syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    assignedToIds: ['user-1'],
    plannedStart: PLANNED_START,
    plannedEnd: PLANNED_END,
    existingEvents: {
      'user-1': { eventId: 'evt-1', email: 'one@test.com', role: 'assignee' },
      'user-2': { eventId: 'evt-2', email: 'two@test.com', role: 'assignee' },
    },
  })

  assert.deepEqual(result, {
    'user-1': {
      eventId: 'evt-1',
      email: 'one@test.com',
      role: 'assignee',
    },
  })
  assert.deepEqual(deleteCalls, [{ email: 'two@test.com', eventId: 'evt-2' }])
})
