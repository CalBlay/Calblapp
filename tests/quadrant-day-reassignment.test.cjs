const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  applyDayReassignmentOperations,
  extractReassignableWorkers,
  isPersonAffectedByReassignment,
  shouldIgnoreBusyQuadrantForMove,
} = require('../src/lib/quadrantDayReassignment')
const {
  getQuadrantOverlapCacheGeneration,
  invalidateQuadrantOverlapCache,
} = require('../src/lib/quadrantOverlapCacheState')

const baseDoc = (workers) => ({
  eventId: 'event-a',
  eventName: 'Event A',
  startDate: '2026-10-30',
  endDate: '2026-10-30',
  startTime: '10:00',
  endTime: '16:00',
  responsable: { id: 'resp-1', name: 'Responsable' },
  conductors: [{ id: 'driver-1', name: 'Conductor' }],
  treballadors: [
    { id: 'resp-1', name: 'Responsable' },
    { id: 'driver-1', name: 'Conductor' },
    ...workers,
  ],
})

test('extractReassignableWorkers excludes responsables and conductors', () => {
  const workers = extractReassignableWorkers(
    baseDoc([{ id: 'worker-1', name: 'Treballador 1' }])
  )
  assert.deepEqual(workers.map((worker) => worker.id), ['worker-1'])
})

test('extractReassignableWorkers merges the same worker from root and group lines', () => {
  const doc = {
    ...baseDoc([{ id: 'worker-1', name: 'Treballador 1' }]),
    groups: [
      {
        id: 'group-1',
        roleLines: [
          {
            role: 'treballador',
            personId: '',
            personName: 'Treballador 1',
          },
        ],
      },
    ],
  }

  assert.equal(extractReassignableWorkers(doc).length, 1)
})

test('validation targets the changed worker and ignores unrelated existing workers', () => {
  const operations = [
    {
      operationId: 'move-damian',
      sourceDocId: 'doc-a',
      destinationDocId: 'doc-b',
      personId: 'damian-1',
      personName: 'Damian',
    },
  ]

  assert.equal(
    isPersonAffectedByReassignment({ id: 'damian-1', name: 'Damian' }, operations),
    true
  )
  assert.equal(
    isPersonAffectedByReassignment({ name: 'Damian' }, operations),
    true
  )
  assert.equal(
    isPersonAffectedByReassignment({ id: 'jordi-1', name: 'Jordi' }, operations),
    false
  )
})

test('a move removes the worker from origin and adds it to destination', () => {
  const operation = {
    operationId: 'move-1',
    sourceDocId: 'doc-a',
    destinationDocId: 'doc-b',
    personId: 'worker-1',
    personName: 'Treballador 1',
  }
  const origin = applyDayReassignmentOperations(
    'doc-a',
    baseDoc([{ id: 'worker-1', name: 'Treballador 1' }]),
    [operation]
  )
  const destination = applyDayReassignmentOperations('doc-b', baseDoc([]), [operation])

  assert.equal(origin.treballadors.some((worker) => worker.id === 'worker-1'), false)
  assert.equal(destination.treballadors.some((worker) => worker.id === 'worker-1'), true)
  assert.equal(destination.treballadors.some((worker) => worker.id === 'driver-1'), true)
})

test('a worker without ids is written without undefined Firestore fields', () => {
  const operation = {
    operationId: 'move-without-id',
    sourceDocId: 'doc-a',
    destinationDocId: 'doc-b',
    personId: '',
    personName: 'Damian',
  }
  const destination = applyDayReassignmentOperations(
    'doc-b',
    {
      ...baseDoc([]),
      groups: [{ roleLines: [] }],
    },
    [operation]
  )
  const damian = destination.treballadors.find((worker) => worker.name === 'Damian')

  assert.equal(damian.id, undefined)
  assert.equal(Object.hasOwn(damian, 'id'), false)
  assert.equal(Object.hasOwn(damian, 'groupId'), false)
})

test('grouped drafts keep group role lines in sync when moving a worker', () => {
  const grouped = {
    ...baseDoc([{ id: 'worker-1', name: 'Treballador 1' }]),
    groups: [
      {
        id: 'group-1',
        serviceDate: '2026-10-30',
        startTime: '10:00',
        endTime: '16:00',
        roleLines: [
          {
            slotId: 'line-1',
            role: 'treballador',
            personId: 'worker-1',
            personName: 'Treballador 1',
          },
        ],
      },
    ],
  }
  const operation = {
    operationId: 'remove-1',
    sourceDocId: 'doc-a',
    destinationDocId: null,
    personId: 'worker-1',
    personName: 'Treballador 1',
  }
  const result = applyDayReassignmentOperations('doc-a', grouped, [operation])
  assert.equal(result.groups[0].roleLines.length, 0)
  assert.equal(result.groups[0].workers, 0)
})

test('availability cache generation changes immediately after invalidation', () => {
  const before = getQuadrantOverlapCacheGeneration()
  invalidateQuadrantOverlapCache()
  assert.equal(getQuadrantOverlapCacheGeneration(), before + 1)
})

test('availability ignores only origin and destination, never a third quadrant', () => {
  const base = {
    currentCollectionId: 'quadrantsCuina',
    busyCollectionId: 'quadrantsCuina',
    sourceDocId: 'doc-a',
    destinationDocId: 'doc-b',
  }

  assert.equal(
    shouldIgnoreBusyQuadrantForMove({ ...base, busyDocId: 'doc-a' }),
    true
  )
  assert.equal(
    shouldIgnoreBusyQuadrantForMove({ ...base, busyDocId: 'doc-b' }),
    true
  )
  assert.equal(
    shouldIgnoreBusyQuadrantForMove({ ...base, busyDocId: 'doc-c' }),
    false
  )
  assert.equal(
    shouldIgnoreBusyQuadrantForMove({
      ...base,
      busyCollectionId: 'quadrantsServeis',
      busyDocId: 'doc-a',
    }),
    false
  )
})

