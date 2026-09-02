const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  findCrossQuadrantConflicts,
  conflictsToAttentionNotes,
  normName,
} = require('../src/lib/quadrantDoubleBooking')

function busy(partial) {
  return {
    id: 'q1',
    status: 'draft',
    startDate: '2026-07-30',
    endDate: '2026-07-30',
    startTime: '10:00',
    endTime: '14:00',
    eventName: 'Casament',
    location: 'Can Blay',
    phaseLabel: 'Servei',
    ...partial,
  }
}

test('normName strips accents and case', () => {
  assert.equal(normName('  María López '), 'maria lopez')
  assert.equal(normName(null), '')
})

test('findCrossQuadrantConflicts detects overlapping person across quadrants', () => {
  const conflicts = findCrossQuadrantConflicts({
    startISO: '2026-07-30T11:00:00',
    endISO: '2026-07-30T13:00:00',
    assignedNames: ['Maria Lopez', 'Extra'],
    busyAssignments: [
      busy({
        id: 'other',
        treballadors: [{ name: 'María López' }],
      }),
    ],
  })

  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].personDisplay, 'Maria Lopez')
  assert.equal(conflicts[0].otherEventName, 'Casament')
  assert.equal(conflicts[0].otherDocId, 'other')
})

test('findCrossQuadrantConflicts ignores cancelled quadrants and Extra placeholders', () => {
  const conflicts = findCrossQuadrantConflicts({
    startISO: '2026-07-30T11:00:00',
    endISO: '2026-07-30T13:00:00',
    assignedNames: ['Extra', 'Joan'],
    busyAssignments: [
      busy({
        id: 'cancelled',
        status: 'cancelled',
        treballadors: [{ name: 'Joan' }],
      }),
      busy({
        id: 'extra-busy',
        treballadors: [{ name: 'Extra' }],
      }),
    ],
  })

  assert.deepEqual(conflicts, [])
})

test('findCrossQuadrantConflicts skips ignoreDocIds and non-overlapping ranges', () => {
  const conflicts = findCrossQuadrantConflicts({
    startISO: '2026-07-30T11:00:00',
    endISO: '2026-07-30T13:00:00',
    assignedNames: ['Anna'],
    ignoreDocIds: new Set(['self']),
    busyAssignments: [
      busy({
        id: 'self',
        responsables: [{ name: 'Anna' }],
      }),
      busy({
        id: 'later',
        startTime: '15:00',
        endTime: '18:00',
        groups: [{ responsibleName: 'Anna' }],
      }),
    ],
  })

  assert.deepEqual(conflicts, [])
})

test('findCrossQuadrantConflicts matches overnight busy ranges that wrap past midnight', () => {
  const conflicts = findCrossQuadrantConflicts({
    startISO: '2026-07-30T23:30:00',
    endISO: '2026-07-31T01:00:00',
    assignedNames: ['Pau'],
    busyAssignments: [
      busy({
        id: 'night',
        startTime: '22:00',
        endTime: '02:00', // end <= start → +1 day
        conductors: [{ name: 'Pau' }],
      }),
    ],
  })

  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].otherPhaseLabel, 'Servei')
})

test('conflictsToAttentionNotes formats actionable messages', () => {
  const notes = conflictsToAttentionNotes([
    {
      personDisplay: 'Anna',
      otherEventName: 'Festa',
      otherLocation: 'Jardí',
      otherPhaseLabel: 'Cuina',
      otherDocId: 'x',
    },
  ])

  assert.equal(notes.length, 1)
  assert.match(notes[0], /Anna ja està assignat\/da a «Festa» \(Jardí\) — Cuina/)
})
