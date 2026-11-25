const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  selectClosingQuadrantDocs,
  applyClosingUpdatesToQuadrantData,
  normalizeClosingEventId,
} = require('../src/lib/quadrantsClosing')

test('selectClosingQuadrantDocs prefers phase docs matched by eventId field over legacy doc(eventId)', () => {
  const eventId = 'deal-123'
  const phaseDoc = {
    id: `${eventId}__event__2026-07-20__event`,
    data: {
      eventId,
      treballadors: [{ name: 'Anna', endTime: '18:00' }],
    },
  }
  const legacyDoc = {
    id: eventId,
    data: {
      eventId,
      treballadors: [],
    },
  }

  const selected = selectClosingQuadrantDocs({
    eventId,
    queriedDocs: [phaseDoc],
    directDoc: legacyDoc,
  })

  assert.deepEqual(
    selected.map((doc) => doc.id),
    [phaseDoc.id]
  )
})

test('selectClosingQuadrantDocs falls back to legacy doc(eventId) when field query is empty', () => {
  const eventId = 'deal-123'
  const legacyDoc = {
    id: eventId,
    data: {
      eventId,
      treballadors: [{ name: 'Anna' }],
    },
  }

  const selected = selectClosingQuadrantDocs({
    eventId,
    queriedDocs: [],
    directDoc: legacyDoc,
  })

  assert.equal(selected.length, 1)
  assert.equal(selected[0].id, eventId)
})

test('service hour closing excludes montage and dismantling phase documents', () => {
  const eventId = 'deal-123'
  const selected = selectClosingQuadrantDocs({
    eventId,
    queriedDocs: [
      { id: `${eventId}__muntatge`, data: { eventId, phaseType: 'muntatge' } },
      { id: `${eventId}__event`, data: { eventId, phaseType: 'event' } },
      { id: `${eventId}__desmuntatge`, data: { eventId, phaseType: 'desmuntatge' } },
    ],
    phaseType: 'event',
  })

  assert.deepEqual(selected.map((doc) => doc.id), [`${eventId}__event`])
})

test('an explicit quadrant closes only its own operational phase', () => {
  const eventId = 'deal-123'
  const montageId = `${eventId}__muntatge`
  const selected = selectClosingQuadrantDocs({
    eventId,
    queriedDocs: [
      { id: montageId, data: { eventId, phaseType: 'muntatge' } },
      { id: `${eventId}__event`, data: { eventId, phaseType: 'event' } },
    ],
    quadrantId: montageId,
  })

  assert.deepEqual(selected.map((doc) => doc.id), [montageId])
})

test('applyClosingUpdatesToQuadrantData writes endTimeReal onto phase-doc workers', () => {
  const { payload, matchedPeople } = applyClosingUpdatesToQuadrantData({
    data: {
      eventId: 'deal-123',
      treballadors: [
        { name: 'Anna', endTime: '18:00' },
        { name: 'Pau', endTime: '18:00' },
      ],
    },
    updates: [
      { name: 'Anna', endTimeReal: '19:15', notes: '', noShow: false, leftEarly: false },
    ],
    department: 'serveis',
    nowIso: '2026-07-26T12:00:00.000Z',
    userId: 'user-1',
  })

  assert.equal(matchedPeople, 1)
  assert.equal(payload.treballadors[0].endTimeReal, '19:15')
  assert.equal(payload.treballadors[1].endTimeReal, undefined)
  assert.equal(payload.updatedAt, '2026-07-26T12:00:00.000Z')
})

test('applyClosingUpdatesToQuadrantData also updates the matching role line', () => {
  const { payload, matchedPeople } = applyClosingUpdatesToQuadrantData({
    data: {
      groups: [
        {
          id: 'line-a',
          roleLines: [
            { personId: 'w1', personName: 'Anna', startTime: '10:00', endTime: '18:00' },
          ],
        },
      ],
    },
    updates: [{ name: 'Anna', endTimeReal: '18:30', notes: 'ok' }],
    department: 'serveis',
    nowIso: '2026-11-02T12:00:00.000Z',
    userId: 'user-1',
  })

  assert.equal(matchedPeople, 1)
  assert.equal(payload.groups[0].roleLines[0].endTimeReal, '18:30')
  assert.equal(payload.groups[0].roleLines[0].sortidaNotes, 'ok')
})

test('late arrival stores the real start and makes it available as the effective start', () => {
  const { payload, matchedPeople } = applyClosingUpdatesToQuadrantData({
    data: {
      treballadors: [{ name: 'Anna', startTime: '10:00', endTime: '18:00' }],
    },
    updates: [
      {
        name: 'Anna',
        startTimeReal: '10:35',
        endTimeReal: '18:00',
        lateArrival: true,
      },
    ],
    department: 'serveis',
    nowIso: '2026-11-16T12:00:00.000Z',
    userId: 'user-1',
  })

  assert.equal(matchedPeople, 1)
  assert.equal(payload.treballadors[0].startTime, '10:00')
  assert.equal(payload.treballadors[0].startTimeReal, '10:35')
  assert.equal(payload.treballadors[0].lateArrival, true)
})

test('closing would miss phase docs if it only looked up collection.doc(eventId)', () => {
  const eventId = 'deal-999'
  const phaseOnly = selectClosingQuadrantDocs({
    eventId,
    queriedDocs: [
      {
        id: `${eventId}__muntatge__2026-07-20__group`,
        data: {
          eventId,
          conductors: [{ name: 'Marc' }],
        },
      },
    ],
    directDoc: null,
  })

  assert.equal(phaseOnly.length, 1)

  const legacyOnlyLookup = selectClosingQuadrantDocs({
    eventId,
    queriedDocs: [],
    directDoc: null,
  })
  assert.equal(legacyOnlyLookup.length, 0)
})

test('applyClosingUpdatesToQuadrantData matches accented names and records closedByDept', () => {
  const { payload, matchedPeople } = applyClosingUpdatesToQuadrantData({
    data: {
      eventId: 'deal-123',
      responsable: { name: 'José María' },
      conductors: [{ name: 'Marc' }],
    },
    updates: [
      {
        name: 'Jose Maria',
        endTimeReal: '20:00',
        notes: 'ok',
        noShow: false,
        leftEarly: true,
      },
    ],
    department: 'Cuina',
    closeDept: true,
    nowIso: '2026-07-26T12:00:00.000Z',
    userId: 'user-1',
  })

  assert.equal(matchedPeople, 1)
  assert.equal(payload.responsable.endTimeReal, '20:00')
  assert.equal(payload.responsable.leftEarly, true)
  assert.equal(payload.responsable.sortidaNotes, 'ok')
  assert.equal(payload.closedByDept.cuina, '2026-07-26T12:00:00.000Z')
  assert.equal(payload.conductors[0].endTimeReal, undefined)
})

test('normalizeClosingEventId strips compound quadrant document suffixes', () => {
  assert.equal(
    normalizeClosingEventId('deal-123__event__2026-07-20__event'),
    'deal-123'
  )
  assert.equal(normalizeClosingEventId('  deal-123  '), 'deal-123')
})

test('a correction increments the revision and returns an auditable before/after change', () => {
  const { payload, changes } = applyClosingUpdatesToQuadrantData({
    data: {
      treballadors: [
        {
          name: 'Anna',
          endTimeReal: '18:00',
          closingRevision: 1,
          sortidaSetBy: { userId: 'first-user', ts: '2026-11-20T10:00:00.000Z' },
        },
      ],
    },
    updates: [{ name: 'Anna', role: 'treballador', endTimeReal: '18:30' }],
    department: 'serveis',
    nowIso: '2026-11-25T12:00:00.000Z',
    userId: 'commercial-1',
    userName: 'Albert',
    correctionReason: 'Hora confirmada pel responsable',
  })

  assert.equal(payload.treballadors[0].closingRevision, 2)
  assert.equal(payload.treballadors[0].closingCorrection.reason, 'Hora confirmada pel responsable')
  assert.equal(changes.length, 1)
  assert.equal(changes[0].isCorrection, true)
  assert.equal(changes[0].before.endTimeReal, '18:00')
  assert.equal(changes[0].after.endTimeReal, '18:30')
})
