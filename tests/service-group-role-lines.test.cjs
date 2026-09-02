const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  sortRoleLinesConductorFirst,
  normalizeGroupRoleLines,
  roleLinesFromLegacyGroup,
  ensureGroupRoleLines,
  syncGroupFromRoleLines,
  countServiceGroupRoleLineTotals,
  getPrimaryServiceRoleLines,
  applyGroupDefaultsToRoleLines,
} = require('../src/app/menu/quadrants/[id]/lib/serviceGroupRoleLines')

const baseGroup = {
  id: 'group-1',
  phaseKey: 'event',
  serviceDate: '2026-07-20',
  dateLabel: '',
  meetingPoint: 'Porta',
  startTime: '10:00',
  endTime: '18:00',
  workers: 0,
  jamoneros: 0,
  wantsResponsible: false,
  responsibleId: '',
  needsDriver: false,
  driverId: '',
}

test('sortRoleLinesConductorFirst orders conductor, responsable, staff, jamonero', () => {
  const sorted = sortRoleLinesConductorFirst([
    { slotId: 'j', role: 'jamonero', personId: 'j1', personName: 'Jam', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 't', role: 'treballador', personId: 't1', personName: 'Trab', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 'r', role: 'responsable', personId: 'r1', personName: 'Resp', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 'c', role: 'conductor', personId: 'c1', personName: 'Cond', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
  ])
  assert.deepEqual(
    sorted.map((l) => l.role),
    ['conductor', 'responsable', 'treballador', 'jamonero']
  )
})

test('roleLinesFromLegacyGroup rebuilds conductor/responsable/workers and ensureGroupRoleLines prefers saved roleLines', () => {
  const legacy = roleLinesFromLegacyGroup({
    ...baseGroup,
    needsDriver: true,
    driverId: 'd1',
    wantsResponsible: true,
    responsibleId: 'r1',
    workerIds: ['w1', 'w2'],
    workerDetails: {
      w1: { id: 'w1', name: 'Worker One', serviceDate: '2026-07-20', meetingPoint: 'A', startTime: '10:00', endTime: '18:00' },
      w2: { id: 'w2', name: 'Worker Two' },
    },
  })
  assert.equal(legacy.some((l) => l.role === 'conductor' && l.personId === 'd1'), true)
  assert.equal(legacy.some((l) => l.role === 'responsable' && l.personId === 'r1'), true)
  assert.equal(legacy.filter((l) => l.role === 'treballador').length, 2)

  const withSaved = ensureGroupRoleLines({
    ...baseGroup,
    roleLines: [
      {
        slotId: 'saved',
        role: 'treballador',
        personId: 'only',
        personName: 'Only Saved',
        serviceDate: '2026-07-20',
        meetingPoint: 'Porta',
        startTime: '10:00',
        endTime: '18:00',
      },
    ],
    needsDriver: true,
    driverId: 'ignored',
  })
  assert.equal(withSaved.length, 1)
  assert.equal(withSaved[0].personId, 'only')
})

test('syncGroupFromRoleLines derives flags, workerDetails, and totals from filled lines', () => {
  const synced = syncGroupFromRoleLines(baseGroup, [
    {
      slotId: 'c',
      role: 'conductor',
      personId: 'd1',
      personName: 'Driver',
      serviceDate: '2026-07-20',
      meetingPoint: 'Porta',
      startTime: '10:00',
      endTime: '18:00',
    },
    {
      slotId: 'r',
      role: 'responsable',
      personId: 'r1',
      personName: 'Resp',
      serviceDate: '2026-07-20',
      meetingPoint: 'Porta',
      startTime: '10:00',
      endTime: '18:00',
    },
    {
      slotId: 'j',
      role: 'jamonero',
      personId: 'j1',
      personName: 'Jam',
      serviceDate: '2026-07-21',
      meetingPoint: 'Cuina',
      startTime: '11:00',
      endTime: '19:00',
    },
    {
      slotId: 'empty',
      role: 'treballador',
      personId: '',
      personName: '',
      serviceDate: '2026-07-20',
      meetingPoint: 'Porta',
      startTime: '10:00',
      endTime: '18:00',
    },
  ])

  assert.equal(synced.needsDriver, true)
  assert.equal(synced.driverId, 'd1')
  assert.equal(synced.wantsResponsible, true)
  assert.equal(synced.responsibleId, 'r1')
  assert.equal(synced.workers, 3)
  assert.equal(synced.jamoneros, 1)
  assert.deepEqual(synced.workerIds, ['j1'])
  assert.equal(synced.workerDetails.j1.name, 'Jam')
  assert.equal(synced.workerDetails.j1.meetingPoint, 'Cuina')
  assert.equal(synced.roleLines.length, 4)
})

test('countServiceGroupRoleLineTotals and getPrimaryServiceRoleLines ignore empty slots', () => {
  const lines = [
    { slotId: 'c', role: 'conductor', personId: 'd1', personName: 'D', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 'r', role: 'responsable', personId: 'r1', personName: 'R', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 't', role: 'treballador', personId: 't1', personName: 'T', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 'j', role: 'jamonero', personId: 'j1', personName: 'J', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
    { slotId: 'e', role: 'treballador', personId: '', personName: '', serviceDate: '', meetingPoint: '', startTime: '', endTime: '' },
  ]
  assert.deepEqual(countServiceGroupRoleLineTotals(lines), {
    workers: 4,
    jamoneros: 1,
    drivers: 1,
    responsables: 1,
  })
  const primary = getPrimaryServiceRoleLines(lines)
  assert.equal(primary.conductor.personId, 'd1')
  assert.equal(primary.responsable.personId, 'r1')
  assert.equal(primary.staffLines.length, 2)
  assert.equal(primary.hasResponsableLine, true)
})

test('normalizeGroupRoleLines inserts empty conductor when empty; applyGroupDefaultsToRoleLines copies group times', () => {
  const normalized = normalizeGroupRoleLines(baseGroup, [])
  assert.equal(normalized.length, 1)
  assert.equal(normalized[0].role, 'conductor')

  const applied = applyGroupDefaultsToRoleLines({
    ...baseGroup,
    meetingPoint: 'Nou punt',
    serviceDate: '2026-08-01',
    startTime: '09:00',
    endTime: '17:00',
    roleLines: [
      {
        slotId: 't',
        role: 'treballador',
        personId: 't1',
        personName: 'Trab',
        serviceDate: 'old',
        meetingPoint: 'old',
        startTime: 'old',
        endTime: 'old',
      },
    ],
  })
  assert.equal(applied.roleLines[0].meetingPoint, 'Nou punt')
  assert.equal(applied.roleLines[0].serviceDate, '2026-08-01')
  assert.equal(applied.roleLines[0].startTime, '09:00')
  assert.equal(applied.roleLines[0].endTime, '17:00')
})
