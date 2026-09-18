const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  countServiceGroupRoleLineTotals,
  createEmptyRoleLine,
  resizeServiceGroupToTotalPersonSlots,
  resizeServiceGroupWorkerSlots,
  syncGroupFromRoleLines,
} = require('../src/app/menu/quadrants/[id]/lib/serviceGroupRoleLines')

function group(overrides = {}) {
  return {
    id: 'group-1',
    phaseKey: 'event',
    serviceDate: '2026-09-10',
    dateLabel: '',
    meetingPoint: 'Cal Blay',
    startTime: '10:00',
    endTime: '18:00',
    workers: 0,
    jamoneros: 0,
    wantsResponsible: false,
    responsibleId: '',
    needsDriver: false,
    driverId: '',
    ...overrides,
  }
}

test('resizing service workers creates the requested blank worker slots', () => {
  const base = group()
  const conductor = createEmptyRoleLine(base, 'conductor')
  const resized = resizeServiceGroupWorkerSlots(
    syncGroupFromRoleLines(base, [conductor]),
    3
  )

  assert.equal(resized.workers, 3)
  assert.equal(resized.roleLines.filter((line) => line.role === 'treballador').length, 3)
  assert.equal(resized.roleLines.filter((line) => line.role === 'conductor').length, 1)
  assert.ok(
    resized.roleLines
      .filter((line) => line.role === 'treballador')
      .every((line) => line.personId === '' && line.personName === '')
  )
})

test('resizing to total person slots subtracts the default conductor line', () => {
  const base = group()
  const conductor = createEmptyRoleLine(base, 'conductor')
  const resized = resizeServiceGroupToTotalPersonSlots(
    syncGroupFromRoleLines(base, [conductor]),
    5
  )

  assert.equal(resized.roleLines.length, 5)
  assert.equal(resized.roleLines.filter((line) => line.role === 'conductor').length, 1)
  assert.equal(resized.roleLines.filter((line) => line.role === 'treballador').length, 4)
  assert.equal(resized.workers, 4)
})

test('resizing service workers preserves assigned staff before empty slots', () => {
  const base = group()
  const assigned = {
    ...createEmptyRoleLine(base, 'treballador'),
    personId: 'worker-1',
    personName: 'Maria',
  }
  const empty = createEmptyRoleLine(base, 'treballador')
  const resized = resizeServiceGroupWorkerSlots(
    syncGroupFromRoleLines(base, [assigned, empty]),
    1
  )

  assert.equal(resized.workers, 1)
  assert.equal(resized.roleLines[0].personId, 'worker-1')
})

test('service totals count blank worker and jamonero slots but not other roles', () => {
  const base = group()
  const lines = [
    createEmptyRoleLine(base, 'conductor'),
    createEmptyRoleLine(base, 'responsable'),
    createEmptyRoleLine(base, 'treballador'),
    createEmptyRoleLine(base, 'jamonero'),
  ]

  assert.deepEqual(countServiceGroupRoleLineTotals(lines), {
    workers: 2,
    jamoneros: 1,
    drivers: 0,
    responsables: 0,
  })
})
