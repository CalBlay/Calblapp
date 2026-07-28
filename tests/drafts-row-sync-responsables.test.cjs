const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  syncRowsWithDraftAndRoster,
} = require('../src/app/menu/quadrants/drafts/components/draftsRowSync')

test('syncRowsWithDraftAndRoster refreshes responsable names from draft.responsables', () => {
  const rows = [
    {
      id: 'r1',
      name: 'Stale Name',
      role: 'responsable',
      groupId: 'group-a',
      startDate: '2026-07-20',
      startTime: '10:00',
      endDate: '2026-07-20',
      endTime: '18:00',
    },
    {
      id: 'r2',
      name: 'Other Stale',
      role: 'responsable',
      groupId: 'group-b',
      startDate: '2026-07-20',
      startTime: '10:00',
      endDate: '2026-07-20',
      endTime: '18:00',
    },
    {
      id: 'c1',
      name: 'Old Conductor',
      role: 'conductor',
      groupId: 'group-a',
      plate: '1234ABC',
      startDate: '2026-07-20',
      startTime: '10:00',
      endDate: '2026-07-20',
      endTime: '18:00',
    },
  ]

  const next = syncRowsWithDraftAndRoster(
    rows,
    {
      id: 'draft-1',
      department: 'serveis',
      startDate: '2026-07-20',
      responsables: [
        { id: 'r1', name: 'Anna Cap', groupId: 'group-a' },
        { id: 'r2', name: 'Bernat Cap', groupId: 'group-b' },
      ],
      conductors: [
        {
          id: 'c1',
          name: 'Carla Conduc',
          plate: '5678XYZ',
          vehicleType: 'Furgoneta',
          arrivalTime: '09:30',
        },
      ],
      treballadors: [],
    },
    {
      responsables: [
        { id: 'r1', name: 'Roster Anna' },
        { id: 'r2', name: 'Roster Bernat' },
      ],
      conductors: [{ id: 'c1', name: 'Roster Carla' }],
      treballadors: [],
    }
  )

  assert.equal(next[0].name, 'Anna Cap')
  assert.equal(next[1].name, 'Bernat Cap')
  assert.equal(next[2].name, 'Carla Conduc')
  assert.equal(next[2].plate, '5678XYZ')
  assert.equal(next[2].vehicleType, 'Furgoneta')
  assert.equal(next[2].arrivalTime, '09:30')
})

test('syncRowsWithDraftAndRoster matches responsable by name+group when id is stale', () => {
  const next = syncRowsWithDraftAndRoster(
    [
      {
        id: 'stale-id',
        name: 'anna cap',
        role: 'responsable',
        groupId: 'group-a',
        startDate: '2026-07-20',
        startTime: '10:00',
        endDate: '2026-07-20',
        endTime: '18:00',
      },
    ],
    {
      id: 'draft-2',
      department: 'serveis',
      startDate: '2026-07-20',
      responsables: [
        { id: 'r2', name: 'Anna Cap', groupId: 'group-b' },
        { id: 'r1', name: 'Ànna Cap', groupId: 'group-a' },
      ],
    },
    {
      responsables: [{ id: 'stale-id', name: 'Roster Fallback' }],
      conductors: [],
      treballadors: [],
    }
  )

  // Stale row id misses; name+group match prefers draft display name over roster.
  assert.equal(next[0].name, 'Ànna Cap')
})
