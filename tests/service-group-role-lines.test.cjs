const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  countServiceGroupRoleLineTotals,
  createEmptyRoleLine,
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

test('resizing clamps worker slots between 0 and 30 and keeps non-staff lines', () => {
  const base = group()
  const conductor = createEmptyRoleLine(base, 'conductor')
  const oversized = resizeServiceGroupWorkerSlots(
    syncGroupFromRoleLines(base, [conductor]),
    99
  )
  const emptied = resizeServiceGroupWorkerSlots(oversized, 0)

  assert.equal(oversized.workers, 30)
  assert.equal(
    oversized.roleLines.filter((line) => line.role === 'treballador').length,
    30
  )
  assert.equal(emptied.workers, 0)
  assert.deepEqual(
    emptied.roleLines.map((line) => line.role),
    ['conductor']
  )
})

test('shrinking below assigned staff drops extra assigned workers', () => {
  const base = group()
  const first = {
    ...createEmptyRoleLine(base, 'treballador'),
    personId: 'worker-1',
    personName: 'Maria',
  }
  const second = {
    ...createEmptyRoleLine(base, 'treballador'),
    personId: 'worker-2',
    personName: 'Joan',
  }
  const resized = resizeServiceGroupWorkerSlots(
    syncGroupFromRoleLines(base, [first, second]),
    1
  )

  assert.equal(resized.workers, 1)
  assert.equal(resized.roleLines[0].personId, 'worker-1')
  assert.equal(
    resized.roleLines.filter((line) => line.role === 'treballador').length,
    1
  )
})
