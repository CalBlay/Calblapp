const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  peopleFromPhase,
  getQuadrantPersonnelSummary,
  countAssignedStaffFromPhases,
} = require('../src/lib/quadrantsDisplayUtils')

function phase(overrides = {}) {
  return {
    id: 'phase-1',
    start: '2026-07-20T10:00:00.000Z',
    quadrantStatus: 'draft',
    phaseLabel: 'EVENT',
    phaseKey: 'event',
    phaseType: 'event',
    displayStartTime: '10:00',
    displayEndTime: '18:00',
    draft: null,
    ...overrides,
  }
}

test('peopleFromPhase reads multiple responsables and roleLines responsables', () => {
  const fromArray = peopleFromPhase(
    phase({
      draft: {
        responsables: [{ name: 'Anna Cap' }, { name: 'Bernat Cap' }],
        conductors: [{ name: 'Carla Conduc' }],
        treballadors: [{ name: 'Dani Obrer' }],
      },
    })
  )

  assert.deepEqual(
    fromArray.map((person) => `${person.role}:${person.name}`),
    [
      'responsable:Anna Cap',
      'responsable:Bernat Cap',
      'conductor:Carla Conduc',
      'treballador:Dani Obrer',
    ]
  )

  const fromRoleLines = peopleFromPhase(
    phase({
      draft: {
        groups: [
          {
            responsibleName: 'Should Ignore Legacy',
            roleLines: [
              { role: 'responsable', personName: 'Elena Cap' },
              { role: 'conductor', personName: 'Ferran Conduc' },
              { role: 'treballador', personName: 'Gina Obrera' },
            ],
          },
        ],
        conductors: [{ name: 'Ferran Conduc' }],
        treballadors: [{ name: 'Gina Obrera' }],
      },
    })
  )

  assert.deepEqual(
    fromRoleLines.map((person) => `${person.role}:${person.name}`),
    [
      'responsable:Elena Cap',
      'conductor:Ferran Conduc',
      'treballador:Gina Obrera',
    ]
  )
  assert.equal(
    fromRoleLines.some((person) => person.name === 'Should Ignore Legacy'),
    false
  )
})

test('countAssignedStaffFromPhases dedupes the same person across multi-quadrant phases', () => {
  const sharedDraft = {
    responsables: [{ name: 'Anna Cap' }],
    conductors: [{ name: 'Bernat Conduc' }],
    treballadors: [{ name: 'Carla Obrera' }],
  }

  const phases = [
    phase({ id: 'day-1', quadrantStatus: 'confirmed', draft: sharedDraft }),
    phase({
      id: 'day-2',
      start: '2026-07-21T10:00:00.000Z',
      quadrantStatus: 'draft',
      draft: {
        responsables: [{ name: 'Anna Cap' }],
        conductors: [{ name: 'Bernat Conduc' }],
        treballadors: [{ name: 'Dani Nou' }],
      },
    }),
    phase({ id: 'pending', quadrantStatus: 'pending', draft: sharedDraft }),
  ]

  // Unique people across managed phases: Anna, Bernat, Carla, Dani = 4
  assert.equal(countAssignedStaffFromPhases(phases), 4)
})

test('getQuadrantPersonnelSummary dedupes identical phase lines and merges people', () => {
  const draft = {
    responsables: [{ name: 'Anna Cap' }],
    conductors: [{ name: 'Bernat Conduc' }],
  }

  const summary = getQuadrantPersonnelSummary([
    phase({ id: 'a', draft }),
    phase({ id: 'b', draft }),
    phase({
      id: 'c',
      draft: {
        responsables: [{ name: 'Carla Cap' }],
        conductors: [{ name: 'Bernat Conduc' }],
      },
    }),
  ])

  assert.equal(summary.phaseLines.length, 2)
  assert.deepEqual(
    summary.people.map((person) => `${person.role}:${person.name}`),
    ['responsable:Anna Cap', 'responsable:Carla Cap', 'conductor:Bernat Conduc']
  )
  assert.equal(summary.hasAnyAssignment, true)
})

test('countAssignedStaffFromPhases falls back to max totalWorkers when roster is empty', () => {
  assert.equal(
    countAssignedStaffFromPhases([
      phase({ quadrantStatus: 'draft', draft: { totalWorkers: 3 } }),
      phase({ quadrantStatus: 'confirmed', draft: { totalWorkers: 5 } }),
      phase({ quadrantStatus: 'pending', draft: { totalWorkers: 99 } }),
    ]),
    5
  )
})
