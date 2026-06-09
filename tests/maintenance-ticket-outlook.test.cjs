const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

function loadOutlookModule({ usersById = {}, upsertImpl, deleteImpl } = {}) {
  const userGets = []
  const upsertCalls = []
  const deleteCalls = []
  const originalLoad = Module._load
  const modulePath = require.resolve('../src/lib/maintenanceTicketOutlook.ts')

  delete require.cache[modulePath]

  const firestoreAdmin = {
    collection(name) {
      assert.equal(name, 'users')
      return {
        doc(userId) {
          return {
            async get() {
              userGets.push(userId)
              const user = usersById[userId]
              return {
                exists: Boolean(user),
                data: () => user,
              }
            },
          }
        },
      }
    },
  }

  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === '@/lib/firebaseAdmin') {
      return { firestoreAdmin }
    }
    if (request === '@/services/graph/calendar') {
      return {
        upsertMaintenanceTicketCalendarEvent: async (input) => {
          upsertCalls.push(input)
          return upsertImpl
            ? upsertImpl(input)
            : { id: `event-${input.assigneeEmail}`, webLink: '' }
        },
        deleteOutlookCalendarEvent: async (email, eventId) => {
          deleteCalls.push({ email, eventId })
          if (deleteImpl) return deleteImpl(email, eventId)
          return undefined
        },
      }
    }
    return originalLoad.apply(this, arguments)
  }

  try {
    return {
      outlook: require('../src/lib/maintenanceTicketOutlook.ts'),
      calls: { userGets, upsertCalls, deleteCalls },
    }
  } finally {
    Module._load = originalLoad
  }
}

test('toOutlookMadridDateTime formats UTC milliseconds in the Europe/Madrid timezone', () => {
  const { outlook } = loadOutlookModule()

  assert.equal(
    outlook.toOutlookMadridDateTime(Date.UTC(2026, 0, 15, 8, 30, 5)),
    '2026-01-15T09:30:05'
  )
  assert.equal(
    outlook.toOutlookMadridDateTime(Date.UTC(2026, 6, 15, 8, 30, 5)),
    '2026-07-15T10:30:05'
  )
})

test('syncMaintenanceTicketOutlookCalendar clears existing events when planning is cleared', async () => {
  const { outlook, calls } = loadOutlookModule()

  const result = await outlook.syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    clearPlanning: true,
    existingEvents: {
      creator: { email: 'creator@example.test', eventId: 'evt-creator', role: 'creator' },
      assignee: { email: 'tech@example.test', eventId: 'evt-tech', role: 'assignee' },
    },
  })

  assert.deepEqual(result, {})
  assert.deepEqual(calls.deleteCalls, [
    { email: 'creator@example.test', eventId: 'evt-creator' },
    { email: 'tech@example.test', eventId: 'evt-tech' },
  ])
  assert.deepEqual(calls.upsertCalls, [])
  assert.deepEqual(calls.userGets, [])
})

test('syncMaintenanceTicketOutlookCalendar leaves events unchanged without complete planning', async () => {
  const existingEvents = {
    creator: { email: 'creator@example.test', eventId: 'evt-creator', role: 'creator' },
  }
  const { outlook, calls } = loadOutlookModule({
    usersById: {
      creator: { email: 'creator@example.test', name: 'Creator' },
      tech: { email: 'tech@example.test', name: 'Tech' },
    },
  })

  const result = await outlook.syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    createdById: 'creator',
    assignedToIds: ['tech'],
    plannedStart: Date.UTC(2026, 0, 15, 8, 0, 0),
    plannedEnd: null,
    existingEvents,
  })

  assert.deepEqual(result, existingEvents)
  assert.deepEqual(calls.userGets, [])
  assert.deepEqual(calls.upsertCalls, [])
  assert.deepEqual(calls.deleteCalls, [])
})

test('syncMaintenanceTicketOutlookCalendar upserts planned users and deletes stale event refs', async () => {
  const { outlook, calls } = loadOutlookModule({
    usersById: {
      creator: { email: 'creator@example.test', name: 'Ticket Creator' },
      tech: { email: 'tech@example.test', name: 'Assigned Tech' },
      invalid: { email: 'not-an-email', name: 'No Mailbox' },
    },
  })

  const result = await outlook.syncMaintenanceTicketOutlookCalendar({
    ticketId: 'ticket-1',
    ticketCode: 'TIC-42',
    location: 'Cuina <Central>',
    machine: 'Forn & Planxa',
    description: 'Needs <urgent> review',
    createdById: 'creator',
    assignedToIds: ['tech', 'invalid', 'tech'],
    assignedToNames: ['Assigned Tech', 'No Mailbox'],
    plannedStart: Date.UTC(2026, 6, 15, 8, 0, 0),
    plannedEnd: Date.UTC(2026, 6, 15, 9, 30, 0),
    existingEvents: {
      creator: { email: 'creator@example.test', eventId: 'evt-existing-creator', role: 'creator' },
      tech: { email: 'old-tech@example.test', eventId: 'evt-old-tech', role: 'assignee' },
      removed: { email: 'removed@example.test', eventId: 'evt-removed', role: 'assignee' },
    },
  })

  assert.deepEqual(new Set(calls.userGets), new Set(['tech', 'invalid', 'creator']))
  assert.equal(calls.upsertCalls.length, 2)

  const creatorCall = calls.upsertCalls.find(
    (call) => call.assigneeEmail === 'creator@example.test'
  )
  assert.equal(creatorCall.eventId, 'evt-existing-creator')
  assert.equal(creatorCall.subject, 'Manteniment assignat · TIC-42 · Cuina <Central>')
  assert.equal(creatorCall.startDateTime, '2026-07-15T10:00:00')
  assert.equal(creatorCall.endDateTime, '2026-07-15T11:30:00')
  assert.match(creatorCall.bodyHtml, /Cuina &lt;Central&gt;/)
  assert.match(creatorCall.bodyHtml, /Forn &amp; Planxa/)
  assert.match(creatorCall.bodyHtml, /Needs &lt;urgent&gt; review/)

  const techCall = calls.upsertCalls.find((call) => call.assigneeEmail === 'tech@example.test')
  assert.equal(techCall.eventId, undefined)
  assert.equal(techCall.subject, 'Ticket manteniment · TIC-42 · Cuina <Central>')

  assert.deepEqual(result, {
    creator: {
      email: 'creator@example.test',
      eventId: 'event-creator@example.test',
      role: 'creator',
    },
    tech: {
      email: 'tech@example.test',
      eventId: 'event-tech@example.test',
      role: 'assignee',
    },
  })
  assert.deepEqual(calls.deleteCalls, [
    { email: 'removed@example.test', eventId: 'evt-removed' },
  ])
})
