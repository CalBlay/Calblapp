const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  assignmentsByDocId,
  buildQuadrantNotificationPlan,
  extractQuadrantNotificationAssignments,
} = require('../src/lib/quadrantNotificationAssignments')

test('first confirmation notifies workers from every quadrant document', () => {
  const plan = buildQuadrantNotificationPlan([
    {
      docId: 'event__muntatge',
      doc: { treballadors: [{ id: 'p-1', name: 'Anna' }], startDate: '2026-10-10' },
    },
    {
      docId: 'event__servei',
      doc: { conductors: [{ id: 'p-2', name: 'Bernat' }], startDate: '2026-10-10' },
    },
  ])

  assert.equal(plan.kind, 'first_confirmation')
  assert.deepEqual(plan.recipients, [
    { personId: 'p-1', name: 'Anna' },
    { personId: 'p-2', name: 'Bernat' },
  ])
  assert.equal(assignmentsByDocId(plan.currentAssignments)['event__servei'].length, 1)
})

test('reconfirmation only notifies people whose assignment changed', () => {
  const previous = extractQuadrantNotificationAssignments(
    {
      treballadors: [
        { id: 'p-1', name: 'Anna', startTime: '10:00' },
        { id: 'p-2', name: 'Bernat', startTime: '10:00' },
      ],
      startDate: '2026-10-10',
      endTime: '18:00',
    },
    'event__servei'
  )
  const plan = buildQuadrantNotificationPlan([
    {
      docId: 'event__servei',
      doc: {
        treballadors: [
          { id: 'p-1', name: 'Anna', startTime: '11:00' },
          { id: 'p-2', name: 'Bernat', startTime: '10:00' },
        ],
        startDate: '2026-10-10',
        endTime: '18:00',
        quadrantNotificationAssignments: previous,
      },
    },
  ])

  assert.equal(plan.kind, 'changed')
  assert.deepEqual(plan.recipients, [{ personId: 'p-1', name: 'Anna' }])
})

test('removed workers are affected by a modification', () => {
  const previous = extractQuadrantNotificationAssignments(
    { treballadors: [{ id: 'p-1', name: 'Anna' }, { id: 'p-2', name: 'Bernat' }] },
    'event__servei'
  )
  const plan = buildQuadrantNotificationPlan([
    {
      docId: 'event__servei',
      doc: {
        treballadors: [{ id: 'p-1', name: 'Anna' }],
        quadrantNotificationAssignments: previous,
      },
    },
  ])

  assert.deepEqual(plan.recipients, [{ personId: 'p-2', name: 'Bernat' }])
})

test('role lines enrich name-only top-level assignments with personnel ids', () => {
  const assignments = extractQuadrantNotificationAssignments(
    {
      treballadors: [{ name: 'Àlex Puig' }],
      groups: [
        {
          roleLines: [
            { personId: 'person-7', personName: 'Alex Puig', role: 'treballador' },
          ],
        },
      ],
    },
    'event__servei'
  )

  assert.ok(assignments.length >= 1)
  assert.ok(assignments.every((assignment) => assignment.personId === 'person-7'))
})
