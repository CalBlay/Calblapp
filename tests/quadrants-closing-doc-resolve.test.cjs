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
