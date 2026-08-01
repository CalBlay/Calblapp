const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  getManualAssignDeptConfig,
  normalizeAssignPersonKey,
  getAssignedPeopleExcludingRow,
  isPersonAssignedElsewhere,
  filterPersonnelPool,
  inferEndDateFromTimes,
  patchRowSchedule,
  normalizeRowSchedule,
  applyGroupScheduleToRows,
  validateEditorRowsNoDuplicatePeople,
  sortRowsByRole,
  patchRowRole,
} = require('../src/lib/manualAssignModel')

const row = (overrides = {}) => ({
  role: 'treballador',
  id: '',
  name: '',
  startDate: '2026-07-28',
  startTime: '22:00',
  endDate: '2026-07-28',
  endTime: '06:00',
  groupId: 'g1',
  ...overrides,
})

test('getManualAssignDeptConfig enables groups/vehicles for cuina and event serveis only', () => {
  assert.equal(getManualAssignDeptConfig('cuina').usesGroups, true)
  assert.equal(getManualAssignDeptConfig('cuina').showVehicleFields, true)
  assert.equal(getManualAssignDeptConfig('serveis', 'event').usesGroups, true)
  assert.equal(getManualAssignDeptConfig('serveis', 'montatge').usesGroups, false)
  assert.equal(getManualAssignDeptConfig('logistica').groupLabel, 'cotxe')
  assert.equal(getManualAssignDeptConfig('serveis').showVestiment, true)
})

test('inferEndDateFromTimes and patchRowSchedule roll overnight shifts to next day', () => {
  assert.equal(inferEndDateFromTimes('2026-07-28', '22:00', '06:00'), '2026-07-29')
  assert.equal(inferEndDateFromTimes('2026-07-28', '09:00', '17:00'), '2026-07-28')
  assert.equal(inferEndDateFromTimes('2026-07-28', '10:00', '10:00'), '2026-07-29')

  const patched = patchRowSchedule(row(), { startTime: '23:00', endTime: '02:00' })
  assert.equal(patched.endDate, '2026-07-29')

  const normalized = normalizeRowSchedule(row({ endDate: '' }))
  assert.equal(normalized.endDate, '2026-07-29')
})

test('applyGroupScheduleToRows applies group times only to matching group and infers overnight endDate', () => {
  const rows = [
    row({ groupId: 'g1', startTime: '08:00', endTime: '16:00', endDate: '2026-07-28' }),
    row({ groupId: 'g2', startTime: '08:00', endTime: '16:00', endDate: '2026-07-28' }),
  ]
  const next = applyGroupScheduleToRows(
    rows,
    'g1',
    {
      serviceDate: '2026-07-28',
      startTime: '22:00',
      endTime: '05:00',
      meetingPoint: 'Magatzem',
    },
    'g1'
  )
  assert.equal(next[0].startTime, '22:00')
  assert.equal(next[0].endDate, '2026-07-29')
  assert.equal(next[0].meetingPoint, 'Magatzem')
  assert.equal(next[1].startTime, '08:00')
  assert.equal(next[1].endDate, '2026-07-28')
})

test('assigned-person helpers match by accent-insensitive id/name and exclude current row', () => {
  assert.equal(normalizeAssignPersonKey('Sònia'), 'sonia')
  const assigned = getAssignedPeopleExcludingRow(
    [
      row({ id: 'u1', name: 'Ada' }),
      row({ id: '', name: 'Sònia' }),
      row({ id: 'u3', name: 'Cara' }),
    ],
    2,
    [{ id: 'u1', name: 'Ada Lovelace' }]
  )
  assert.equal(assigned.ids.has('u1'), true)
  assert.equal(assigned.names.has('sonia'), true)
  assert.equal(assigned.names.has('ada'), true)
  assert.equal(assigned.ids.has('u3'), false)

  assert.equal(isPersonAssignedElsewhere({ id: '', name: 'sonia' }, assigned), true)
  assert.deepEqual(
    filterPersonnelPool(
      [
        { id: 'u1', name: 'Ada' },
        { id: 'u9', name: 'Free' },
      ],
      assigned
    ).map((p) => p.id),
    ['u9']
  )
})

test('validateEditorRowsNoDuplicatePeople ignores externals and reports local duplicates', () => {
  assert.equal(
    validateEditorRowsNoDuplicatePeople([
      row({ id: 'u1', name: 'Ada' }),
      row({ id: 'ext', name: 'ETT', isExternal: true }),
      row({ id: 'u2', name: 'Bob' }),
    ]),
    null
  )
  const err = validateEditorRowsNoDuplicatePeople([
    row({ id: 'u1', name: 'Ada' }),
    row({ id: '', name: 'ada' }),
  ])
  assert.equal(typeof err, 'string')
  assert.ok(err.length > 0)
})

test('sortRowsByRole and patchRowRole preserve jamonero / clear vehicle when leaving conductor', () => {
  const sorted = sortRowsByRole([
    { role: 'treballador', isJamonero: false },
    { role: 'responsable' },
    { role: 'treballador', isJamonero: true },
    { role: 'conductor' },
  ])
  assert.deepEqual(
    sorted.map((r) => `${r.role}:${r.isJamonero ? 'j' : ''}`),
    ['responsable:', 'conductor:', 'treballador:j', 'treballador:']
  )

  const jamonero = patchRowRole(row({ role: 'conductor', plate: 'B123', vehicleType: 'furgoneta' }), 'jamonero')
  assert.equal(jamonero.role, 'treballador')
  assert.equal(jamonero.isJamonero, true)

  const worker = patchRowRole(row({ role: 'conductor', plate: 'B123', vehicleType: 'furgoneta' }), 'treballador')
  assert.equal(worker.plate, '')
  assert.equal(worker.vehicleType, '')
})
