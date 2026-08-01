const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isCuinaCenterExternalExtraLine,
  countFilledCuinaRoleLines,
  countCuinaStaffTotals,
  ensureCuinaRoleLines,
  syncCuinaGroupFromRoleLines,
  cuinaWorkerLineKey,
} = require('../src/app/menu/quadrants/[id]/lib/cuinaGroupRoleLines')

const baseGroup = {
  id: 'cotxe-1',
  meetingPoint: 'Cuina',
  startTime: '08:00',
  arrivalTime: '07:30',
  endTime: '16:00',
  serviceDate: '2026-07-28',
  workers: 0,
  drivers: 0,
  needsDriver: false,
  wantsResponsible: false,
  responsibleId: '',
  driverMode: '__auto__',
  vehicleType: '',
}

const line = (overrides = {}) => ({
  slotId: overrides.slotId || `slot-${Math.random().toString(16).slice(2)}`,
  role: 'treballador',
  personId: '',
  personName: '',
  serviceDate: '2026-07-28',
  meetingPoint: 'Cuina',
  startTime: '08:00',
  endTime: '16:00',
  arrivalTime: '07:30',
  ...overrides,
})

test('isCuinaCenterExternalExtraLine detects flag, externalType, and Extra C.Extern name', () => {
  assert.equal(
    isCuinaCenterExternalExtraLine(line({ isCenterExternalExtra: true })),
    true
  )
  assert.equal(
    isCuinaCenterExternalExtraLine(line({ externalType: 'centerExternalExtra' })),
    true
  )
  assert.equal(
    isCuinaCenterExternalExtraLine(line({ personName: 'Extra C.Extern 1' })),
    true
  )
  assert.equal(isCuinaCenterExternalExtraLine(line({ personName: 'Maria' })), false)
})

test('ensureCuinaRoleLines prefers saved roleLines over legacy workerIds/driverAssignments', () => {
  const saved = ensureCuinaRoleLines({
    ...baseGroup,
    needsDriver: true,
    driverAssignments: [{ vehicleType: 'furgoneta', driverMode: 'ignored' }],
    workerIds: ['ignored'],
    roleLines: [
      line({ slotId: 'saved', role: 'treballador', personId: 'w1', personName: 'Only Saved' }),
    ],
  })
  assert.equal(saved.length, 1)
  assert.equal(saved[0].personId, 'w1')

  const fromLegacy = ensureCuinaRoleLines({
    ...baseGroup,
    wantsResponsible: true,
    responsibleId: 'r1',
    driverAssignments: [{ vehicleType: 'furgoneta', driverMode: '__responsable__' }],
    vehicleAssignments: [{ slotId: 'veh-1', vehicleType: 'furgoneta', vehicleId: '', plate: '', conductorId: null, arrivalTime: '07:15' }],
    workerIds: ['w1'],
    workerDetails: {
      w1: { id: 'w1', name: 'Worker One', meetingPoint: 'Magatzem', startTime: '09:00', endTime: '17:00' },
    },
  })
  assert.equal(fromLegacy.some((l) => l.role === 'responsable' && l.personId === 'r1'), true)
  assert.equal(fromLegacy.some((l) => l.role === 'conductor' && l.personId === 'r1' && l.slotId === 'veh-1'), true)
  const worker = fromLegacy.find((l) => l.role === 'treballador')
  assert.equal(worker.personId, 'w1')
  assert.equal(worker.meetingPoint, 'Magatzem')
})

test('syncCuinaGroupFromRoleLines derives flags, vehicles, and workerDetails; empty slots stay in workers count', () => {
  const synced = syncCuinaGroupFromRoleLines(
    baseGroup,
    [
      line({ slotId: 'c1', role: 'conductor', personId: 'd1', personName: 'Driver', arrivalTime: '07:10' }),
      line({ slotId: 'r1', role: 'responsable', personId: 'r1', personName: 'Resp' }),
      line({ slotId: 'w1', role: 'treballador', personId: 'w1', personName: 'Worker', meetingPoint: 'Porta' }),
      line({ slotId: 'empty', role: 'treballador', personId: '', personName: '' }),
    ],
    [{ slotId: 'c1', vehicleType: 'furgoneta', vehicleId: 'v1', plate: '1234ABC', conductorId: null, arrivalTime: '' }]
  )

  assert.equal(synced.needsDriver, true)
  assert.equal(synced.drivers, 1)
  assert.equal(synced.wantsResponsible, true)
  assert.equal(synced.responsibleId, 'r1')
  assert.equal(synced.workers, 2)
  assert.equal(synced.vehicleAssignments[0].vehicleType, 'furgoneta')
  assert.equal(synced.vehicleAssignments[0].conductorId, 'd1')
  assert.equal(synced.vehicleAssignments[0].arrivalTime, '07:10')
  assert.equal(synced.driverAssignments[0].driverMode, 'd1')
  assert.equal(synced.workerDetails.w1.meetingPoint, 'Porta')
  assert.equal(cuinaWorkerLineKey(line({ slotId: 'empty', personId: '', personName: '' })), '__slot__:empty')
})

test('countCuinaStaffTotals counts filled lines, center extras, and manual responsible fallback', () => {
  const groups = [
    {
      ...baseGroup,
      roleLines: [
        line({ role: 'treballador', personId: 'w1', personName: 'W' }),
        line({
          role: 'treballador',
          personId: '',
          personName: 'Extra C.Extern',
          isCenterExternalExtra: true,
          externalType: 'centerExternalExtra',
        }),
        line({ role: 'conductor', personId: 'd1', personName: 'D' }),
        line({ role: 'treballador', personId: '', personName: '' }),
      ],
    },
  ]

  assert.equal(countFilledCuinaRoleLines(groups[0], 'treballador'), 2)
  assert.deepEqual(countCuinaStaffTotals(groups), {
    workers: 2,
    drivers: 1,
    responsables: 0,
    headcount: 3,
  })

  assert.deepEqual(countCuinaStaffTotals(groups, 'manual-r1'), {
    workers: 2,
    drivers: 1,
    responsables: 1,
    headcount: 4,
  })

  const withLegacyResp = [
    {
      ...baseGroup,
      wantsResponsible: true,
      responsibleId: 'legacy-r',
      roleLines: [line({ role: 'treballador', personId: 'w1', personName: 'W' })],
    },
  ]
  assert.equal(countCuinaStaffTotals(withLegacyResp).responsables, 1)
})
