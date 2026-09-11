const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  hydrateServiceGroupsFromDraft,
} = require('../src/app/menu/quadrants/[id]/lib/hydrateServiceGroupsFromDraft')

function draft(overrides = {}) {
  return {
    id: 'draft-1',
    department: 'serveis',
    startDate: '2026-09-12',
    startTime: '10:00',
    endTime: '18:00',
    meetingPoint: 'Cal Blay',
    ...overrides,
  }
}

function eventGroup(input, pools = []) {
  return hydrateServiceGroupsFromDraft(input, pools).groups.find(
    (group) => group.phaseKey === 'event'
  )
}

function staffLines(group) {
  return group.roleLines.filter(
    (line) => line.role === 'treballador' || line.role === 'jamonero'
  )
}

test('reopening a Serveis draft keeps blank worker slots from saved roleLines', () => {
  const group = eventGroup(
    draft({
      groups: [
        {
          id: 'group-1',
          serviceDate: '2026-09-12',
          meetingPoint: 'Cal Blay',
          startTime: '10:00',
          endTime: '18:00',
          roleLines: [
            {
              slotId: 'slot-c',
              role: 'conductor',
              personId: 'd1',
              personName: 'Pere',
            },
            { slotId: 'slot-w1', role: 'treballador', personId: '', personName: '' },
            { slotId: 'slot-w2', role: 'treballador', personId: '', personName: '' },
          ],
        },
      ],
    })
  )

  assert.equal(group.workers, 2)
  assert.equal(staffLines(group).length, 2)
  assert.ok(
    staffLines(group).every((line) => line.personId === '' && !line.personName)
  )
  assert.equal(
    group.roleLines.find((line) => line.role === 'conductor')?.personId,
    'd1'
  )
})

test('saved workers count recreates blank slots when roleLines are missing', () => {
  const group = eventGroup(
    draft({
      groups: [
        {
          id: 'group-1',
          serviceDate: '2026-09-12',
          meetingPoint: 'Cal Blay',
          startTime: '10:00',
          endTime: '18:00',
          workers: 3,
        },
      ],
    })
  )

  assert.equal(group.workers, 3)
  assert.equal(staffLines(group).length, 3)
  assert.equal(
    group.roleLines.filter((line) => line.role === 'conductor').length,
    1
  )
})

test('assigned jamonero and leftover empty worker slots both survive hydration', () => {
  const group = eventGroup(
    draft({
      groups: [
        {
          id: 'group-1',
          serviceDate: '2026-09-12',
          meetingPoint: 'Cal Blay',
          startTime: '10:00',
          endTime: '18:00',
          roleLines: [
            {
              slotId: 'slot-c',
              role: 'conductor',
              personId: 'd1',
              personName: 'Pere',
            },
            {
              slotId: 'slot-j',
              role: 'jamonero',
              personId: 'j1',
              personName: 'Joan',
            },
            { slotId: 'slot-w', role: 'treballador', personId: '', personName: '' },
          ],
        },
      ],
    })
  )

  assert.equal(group.workers, 2)
  assert.equal(group.jamoneros, 1)
  assert.equal(
    group.roleLines.find((line) => line.role === 'jamonero')?.personId,
    'j1'
  )
  assert.equal(staffLines(group).filter((line) => !line.personId).length, 1)
})

test('hydrate resolves a name-only worker against the personnel pool', () => {
  const group = eventGroup(
    draft({
      groups: [
        {
          id: 'group-1',
          serviceDate: '2026-09-12',
          meetingPoint: 'Cal Blay',
          startTime: '10:00',
          endTime: '18:00',
          roleLines: [
            {
              slotId: 'slot-w',
              role: 'treballador',
              personId: '',
              personName: 'Maria Núñez',
            },
          ],
        },
      ],
    }),
    [{ id: 'p-1', name: 'Maria Nunez' }]
  )

  const worker = staffLines(group)[0]
  assert.equal(worker.personId, 'p-1')
  assert.equal(worker.personName, 'Maria Nunez')
})
