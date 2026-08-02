const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  hydrateCuinaGroupsFromDraft,
} = require('../src/app/menu/quadrants/[id]/lib/hydrateCuinaGroupsFromDraft')

const rolesOf = (group) => (group.roleLines || []).map((line) => ({
  role: line.role,
  personId: String(line.personId || ''),
  personName: String(line.personName || ''),
  isCenterExternalExtra: Boolean(line.isCenterExternalExtra),
}))

test('prefers saved group roleLines over legacy conductors/treballadors', () => {
  const groups = hydrateCuinaGroupsFromDraft({
    draft: {
      id: 'E1',
      startDate: '2026-08-01',
      startTime: '10:00',
      endTime: '18:00',
      meetingPoint: 'CENTRAL',
      conductors: [{ id: 'd-legacy', name: 'Legacy Driver' }],
      treballadors: [{ id: 'w-legacy', name: 'Legacy Worker' }],
      groups: [
        {
          id: 'g1',
          serviceDate: '2026-08-01',
          meetingPoint: 'SALA',
          startTime: '11:00',
          endTime: '17:00',
          workers: 1,
          drivers: 1,
          wantsResponsible: true,
          roleLines: [
            {
              slotId: 'r1',
              role: 'responsable',
              personId: 'r-1',
              personName: 'Resp Saved',
            },
            {
              slotId: 'c1',
              role: 'conductor',
              personId: 'd-1',
              personName: 'Driver Saved',
            },
            {
              slotId: 'w1',
              role: 'treballador',
              personId: 'w-1',
              personName: 'Worker Saved',
            },
          ],
        },
      ],
    },
    fallback: {},
  })

  assert.equal(groups.length, 1)
  // ensureCuinaRoleLines keeps conductor before responsable/treballador.
  assert.deepEqual(rolesOf(groups[0]), [
    { role: 'conductor', personId: 'd-1', personName: 'Driver Saved', isCenterExternalExtra: false },
    { role: 'responsable', personId: 'r-1', personName: 'Resp Saved', isCenterExternalExtra: false },
    { role: 'treballador', personId: 'w-1', personName: 'Worker Saved', isCenterExternalExtra: false },
  ])
})

test('legacy path collapses same responsable/driver and skips reserved workers', () => {
  const groups = hydrateCuinaGroupsFromDraft({
    draft: {
      id: 'E2',
      startDate: '2026-08-02',
      startTime: '09:00',
      endTime: '15:00',
      meetingPoint: 'CENTRAL',
      conductors: [{ id: 'u-anna', name: 'Anna Driver', vehicleType: 'furgoneta', plate: 'B1234' }],
      treballadors: [
        { id: 'u-anna', name: 'Anna Driver' },
        { id: 'w-2', name: 'Pau Worker' },
        { id: '', name: 'extra' },
        { id: '', name: 'Extra C.Extern - Sala' },
      ],
      groups: [
        {
          id: 'g-legacy',
          serviceDate: '2026-08-02',
          workers: 2,
          drivers: 1,
          needsDriver: true,
          wantsResponsible: true,
          // Name-only reservation so reservedNorms match worker personName norms.
          responsibleName: 'Anna Driver',
          driverName: 'Anna Driver',
        },
      ],
    },
    fallback: {},
  })

  assert.equal(groups.length, 1)
  const group = groups[0]
  assert.equal(group.driverMode, '__responsable__')
  assert.deepEqual(rolesOf(group), [
    {
      role: 'conductor',
      personId: 'u-anna',
      personName: 'Anna Driver',
      isCenterExternalExtra: false,
    },
    {
      role: 'treballador',
      personId: 'w-2',
      personName: 'Pau Worker',
      isCenterExternalExtra: false,
    },
    {
      role: 'treballador',
      personId: '',
      personName: 'Extra C.Extern - Sala',
      isCenterExternalExtra: true,
    },
  ])
  assert.equal(group.vehicleAssignments?.length, 1)
  assert.equal(group.vehicleAssignments[0].plate, 'B1234')
})

test('empty legacy groups get a blank treballador placeholder', () => {
  const groups = hydrateCuinaGroupsFromDraft({
    draft: {
      id: 'E3',
      startDate: '2026-08-03',
      groups: [
        {
          id: 'g-empty',
          workers: 0,
          drivers: 0,
          needsDriver: false,
          wantsResponsible: false,
        },
      ],
      conductors: [],
      treballadors: [],
    },
    fallback: { meetingPoint: 'CENTRAL', startTime: '08:00', endTime: '16:00' },
  })

  assert.equal(groups.length, 1)
  assert.deepEqual(rolesOf(groups[0]), [
    { role: 'treballador', personId: '', personName: '', isCenterExternalExtra: false },
  ])
})

test('falls back to a single group when draft.groups is absent', () => {
  const groups = hydrateCuinaGroupsFromDraft({
    draft: {
      id: 'E4',
      startDate: '2026-08-04',
      startTime: '12:00',
      endTime: '20:00',
      meetingPoint: 'CUINA',
      responsableId: 'r-9',
      responsableName: 'Cap Cuina',
      conductors: [{ id: 'd-9', name: 'Conductor 9' }],
      treballadors: [{ id: 'w-9', name: 'Worker 9' }],
    },
    fallback: {
      workers: 1,
      drivers: 1,
      needsDriver: true,
      wantsResponsible: true,
      responsibleId: 'r-9',
      responsibleName: 'Cap Cuina',
      driverId: 'd-9',
      driverName: 'Conductor 9',
    },
  })

  assert.equal(groups.length, 1)
  const roles = rolesOf(groups[0])
  assert.ok(roles.some((r) => r.role === 'responsable' && r.personId === 'r-9'))
  assert.ok(roles.some((r) => r.role === 'conductor' && r.personId === 'd-9'))
  assert.ok(roles.some((r) => r.role === 'treballador' && r.personId === 'w-9'))
})
