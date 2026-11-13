const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  attachManualWorkerLineSchedules,
  collectQuadrantLinePersonnel,
} = require('../src/lib/quadrantLinePersonnel')

test('role-line hours override quadrant header hours for every assigned person', () => {
  const rows = collectQuadrantLinePersonnel({
    startDate: '2026-11-10',
    startTime: '08:00',
    endTime: '23:00',
    meetingPoint: 'Capcalera',
    treballadors: [
      { id: 'w1', name: 'Anna', endTimeReal: '18:15' },
      { id: 'w2', name: 'Pau' },
    ],
    groups: [
      {
        id: 'line-a',
        serviceDate: '2026-11-11',
        startTime: '10:00',
        endTime: '18:00',
        meetingPoint: 'Magatzem',
        roleLines: [
          { personId: 'w1', personName: 'Anna', role: 'treballador', startTime: '10:30', endTime: '17:45' },
        ],
      },
      {
        id: 'line-b',
        serviceDate: '2026-11-11',
        startTime: '12:00',
        endTime: '20:00',
        roleLines: [
          { personId: 'w2', personName: 'Pau', role: 'conductor' },
        ],
      },
    ],
  })

  assert.deepEqual(
    rows.map((row) => ({
      name: row.name,
      role: row.role,
      startDate: row.startDate,
      startTime: row.startTime,
      endTime: row.endTime,
      groupId: row.groupId,
      endTimeReal: row.endTimeReal,
    })),
    [
      {
        name: 'Anna',
        role: 'treballador',
        startDate: '2026-11-11',
        startTime: '10:30',
        endTime: '17:45',
        groupId: 'line-a',
        endTimeReal: '18:15',
      },
      {
        name: 'Pau',
        role: 'conductor',
        startDate: '2026-11-11',
        startTime: '12:00',
        endTime: '20:00',
        groupId: 'line-b',
        endTimeReal: undefined,
      },
    ]
  )
})

test('legacy quadrants still fall back to person and header hours', () => {
  const [person] = collectQuadrantLinePersonnel({
    startDate: '2026-11-10',
    startTime: '08:00',
    endTime: '16:00',
    treballadors: [{ name: 'Anna', startTime: '09:00' }],
  })

  assert.equal(person.startTime, '09:00')
  assert.equal(person.endTime, '16:00')
})

test('legacy top-level responsible belongs to only the first service group', () => {
  const rows = collectQuadrantLinePersonnel({
    startDate: '2026-11-17',
    responsable: { id: 'resp-1', name: 'Digno Belliard' },
    groups: [
      {
        id: 'group-muntatge',
        serviceDate: '2026-11-16',
        startTime: '15:00',
        endTime: '19:00',
      },
      {
        id: 'group-event',
        serviceDate: '2026-11-17',
        startTime: '07:00',
        endTime: '15:00',
      },
    ],
  })

  assert.deepEqual(
    rows.map((row) => ({ name: row.name, groupId: row.groupId, startDate: row.startDate })),
    [{ name: 'Digno Belliard', groupId: 'group-muntatge', startDate: '2026-11-16' }]
  )
})

test('logistics manual worker lines keep their own schedule when saved', () => {
  const [worker] = attachManualWorkerLineSchedules(
    [{ name: 'Anna' }],
    [
      {
        name: 'Anna',
        serviceDate: '2026-11-10',
        startTime: '10:30',
        endTime: '17:45',
        meetingPoint: 'Magatzem',
      },
    ],
    { startTime: '08:00', endTime: '22:00', meetingPoint: 'Capcalera' }
  )

  assert.equal(worker.startTime, '10:30')
  assert.equal(worker.endTime, '17:45')
  assert.equal(worker.meetingPoint, 'Magatzem')
})
