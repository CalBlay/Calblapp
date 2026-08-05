const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { findQuadrantOverlapConflicts } = require('../src/lib/quadrantOverlapGuard')
const {
  extractOverlapAssignmentsFromQuadrantSave,
} = require('../src/lib/quadrantsPost/overlap')

test('findQuadrantOverlapConflicts detects same-person time overlap via preloaded busy docs', async () => {
  const conflicts = await findQuadrantOverlapConflicts({
    assignments: [
      {
        id: 'u-anna',
        name: 'Anna',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '10:00',
        endTime: '14:00',
      },
    ],
    preloadedBusyDocs: [
      {
        collectionId: 'quadrants_serveis',
        docId: 'busy-1',
        doc: {
          eventId: 'other-event',
          startDate: '2026-08-05',
          endDate: '2026-08-05',
          startTime: '09:00',
          endTime: '18:00',
          treballadors: [{ id: 'u-anna', name: 'Anna' }],
        },
      },
    ],
  })

  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].personKey, 'u-anna')
  assert.equal(conflicts[0].source.eventId, 'other-event')
  assert.equal(conflicts[0].busy.startTime, '09:00')
})

test('findQuadrantOverlapConflicts ignores accent differences and respects excludeEventId', async () => {
  const busyDocs = [
    {
      collectionId: 'quadrants_serveis',
      docId: 'busy-accent',
      doc: {
        eventId: 'event-keep',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '12:00',
        endTime: '16:00',
        conductors: [{ name: 'Josép' }],
      },
    },
  ]

  const conflicts = await findQuadrantOverlapConflicts({
    assignments: [
      {
        name: 'Josep',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '14:00',
        endTime: '18:00',
      },
    ],
    preloadedBusyDocs: busyDocs,
  })
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].personKey, 'josep')

  const excluded = await findQuadrantOverlapConflicts({
    assignments: [
      {
        name: 'Josep',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '14:00',
        endTime: '18:00',
      },
    ],
    excludeEventId: 'event-keep',
    preloadedBusyDocs: busyDocs,
  })
  assert.equal(excluded.length, 0)
})

test('findQuadrantOverlapConflicts treats overnight end<=start as +24h wrap', async () => {
  const conflicts = await findQuadrantOverlapConflicts({
    assignments: [
      {
        id: 'u-night',
        name: 'Night Worker',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '22:00',
        endTime: '02:00',
      },
    ],
    preloadedBusyDocs: [
      {
        collectionId: 'quadrants_cuina',
        docId: 'busy-night',
        doc: {
          eventId: 'night-event',
          startDate: '2026-08-06',
          endDate: '2026-08-06',
          startTime: '01:00',
          endTime: '05:00',
          treballadors: [{ id: 'u-night', name: 'Night Worker' }],
        },
      },
    ],
  })

  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].source.docId, 'busy-night')
})

test('findQuadrantOverlapConflicts skips excludeDocIds and non-overlapping ranges', async () => {
  const conflicts = await findQuadrantOverlapConflicts({
    assignments: [
      {
        id: 'u-pau',
        name: 'Pau',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '08:00',
        endTime: '10:00',
      },
    ],
    excludeDocIds: ['self-doc'],
    preloadedBusyDocs: [
      {
        collectionId: 'quadrants_serveis',
        docId: 'self-doc',
        doc: {
          eventId: 'same-save',
          startDate: '2026-08-05',
          endDate: '2026-08-05',
          startTime: '08:00',
          endTime: '10:00',
          treballadors: [{ id: 'u-pau', name: 'Pau' }],
        },
      },
      {
        collectionId: 'quadrants_serveis',
        docId: 'later-doc',
        doc: {
          eventId: 'later-event',
          startDate: '2026-08-05',
          endDate: '2026-08-05',
          startTime: '11:00',
          endTime: '13:00',
          treballadors: [{ id: 'u-pau', name: 'Pau' }],
        },
      },
    ],
  })

  assert.equal(conflicts.length, 0)
})

test('extractOverlapAssignmentsFromQuadrantSave collects personnel and group responsables', () => {
  const assignments = extractOverlapAssignmentsFromQuadrantSave({
    eventId: 'E1',
    startDate: '2026-08-05',
    endDate: '2026-08-05',
    startTime: '10:00',
    endTime: '18:00',
    responsableName: 'Resp One',
    conductors: [{ id: 'c1', name: 'Driver One', startTime: '09:00', endTime: '12:00' }],
    treballadors: [{ id: 'w1', name: 'Worker One' }],
    groups: [
      {
        responsibleId: 'r2',
        responsibleName: 'Group Resp',
        serviceDate: '2026-08-06',
        startTime: '11:00',
        endTime: '15:00',
      },
    ],
  })

  assert.equal(assignments.length, 4)
  assert.equal(assignments[0].name, 'Resp One')
  assert.deepEqual(
    assignments.find((a) => a.id === 'c1'),
    {
      id: 'c1',
      name: 'Driver One',
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      startTime: '09:00',
      endTime: '12:00',
    }
  )
  assert.deepEqual(
    assignments.find((a) => a.id === 'r2'),
    {
      id: 'r2',
      name: 'Group Resp',
      startDate: '2026-08-06',
      endDate: '2026-08-06',
      startTime: '11:00',
      endTime: '15:00',
    }
  )
})
