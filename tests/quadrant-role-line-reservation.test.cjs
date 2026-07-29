const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  linesShareSamePerson,
  roleLinePersonReservationKey,
  collectReservedPersonKeysFromLines,
  buildReservedForRoleLine,
  dedupeRoleLinePersonAssignments,
  findDuplicateRoleLinePersonKeys,
  extractDraftResponsible,
  mergeResponsibleCandidatePools,
} = require('../src/app/menu/quadrants/[id]/lib/quadrantPayloadShared')

const {
  filterPersonnelAfterLocalQuadrantCheck,
  validateNoLocalQuadrantPersonDuplicates,
  collectLocalExcludeIdsAndNames,
} = require('../src/lib/quadrantLocalAvailability')

test('linesShareSamePerson matches by id, name, or mixed id/name keys', () => {
  assert.equal(
    linesShareSamePerson({ personId: 'u1', personName: 'Ada' }, { personId: 'u1', personName: '' }),
    true
  )
  assert.equal(
    linesShareSamePerson({ personId: '', personName: 'Sònia' }, { personId: '', personName: 'sonia' }),
    true
  )
  assert.equal(
    linesShareSamePerson({ personId: 'sonia', personName: '' }, { personId: '', personName: 'Sònia' }),
    true
  )
  assert.equal(
    linesShareSamePerson({ personId: 'u1', personName: 'Ada' }, { personId: 'u2', personName: 'Bob' }),
    false
  )
})

test('collectReservedPersonKeysFromLines excludes current slot and builds id/name keys', () => {
  const reserved = collectReservedPersonKeysFromLines(
    [
      { slotId: 'a', personId: 'u1', personName: 'Ada' },
      { slotId: 'b', personId: '', personName: 'Bob' },
      { slotId: 'c', personId: 'u3', personName: 'Cara' },
    ],
    'c'
  )
  assert.equal(reserved.has('u1'), true)
  assert.equal(reserved.has('name:ada'), true)
  assert.equal(reserved.has('name:bob'), true)
  assert.equal(reserved.has('u3'), false)
})

test('buildReservedForRoleLine frees manual responsible when only on current conductor/responsable line', () => {
  const lines = [
    { slotId: 'cond', role: 'conductor', personId: 'r1', personName: 'Resp' },
    { slotId: 'w1', role: 'treballador', personId: 'w1', personName: 'Worker' },
  ]
  const reserved = buildReservedForRoleLine(lines, lines[0], 'r1')
  assert.equal(reserved.has('r1'), false)
  assert.equal(reserved.has('w1'), true)

  const reservedWhenAlsoOnWorker = buildReservedForRoleLine(
    [
      ...lines,
      { slotId: 'w2', role: 'treballador', personId: 'r1', personName: 'Resp' },
    ],
    lines[0],
    'r1'
  )
  assert.equal(reservedWhenAlsoOnWorker.has('r1'), true)
})

test('dedupeRoleLinePersonAssignments clears later duplicates; preferred slot wins', () => {
  const lines = [
    { slotId: 'a', personId: 'u1', personName: 'Ada' },
    { slotId: 'b', personId: 'u1', personName: 'Ada' },
    { slotId: 'c', personId: 'u2', personName: 'Bob' },
  ]
  const cleared = dedupeRoleLinePersonAssignments(lines)
  assert.equal(cleared[0].personId, 'u1')
  assert.equal(cleared[1].personId, '')
  assert.equal(cleared[2].personId, 'u2')

  const preferred = dedupeRoleLinePersonAssignments(lines, 'b')
  assert.equal(preferred[0].personId, '')
  assert.equal(preferred[1].personId, 'u1')
})

test('findDuplicateRoleLinePersonKeys reports shared assignments', () => {
  const keys = findDuplicateRoleLinePersonKeys([
    { personId: 'u1', personName: 'Ada' },
    { personId: '', personName: 'ada' },
    { personId: 'u2', personName: 'Bob' },
  ])
  assert.deepEqual(keys, [roleLinePersonReservationKey({ personId: 'u1', personName: 'Ada' })])
})

test('extractDraftResponsible prefers top-level, then responsables[], then roleLines', () => {
  assert.deepEqual(
    extractDraftResponsible({
      responsableId: 'top',
      responsableName: 'Top',
      responsables: [{ id: 'ex', name: 'Explicit' }],
      groups: [
        {
          wantsResponsible: true,
          roleLines: [{ role: 'responsable', personId: 'g1', personName: 'Group' }],
        },
      ],
    }),
    { id: 'top', name: 'Top' }
  )

  assert.deepEqual(
    extractDraftResponsible({
      responsables: [{ id: 'ex', name: 'Explicit' }],
      groups: [
        {
          wantsResponsible: true,
          roleLines: [{ role: 'responsable', personId: 'g1', personName: 'Group' }],
        },
      ],
    }),
    { id: 'ex', name: 'Explicit' }
  )

  assert.deepEqual(
    extractDraftResponsible({
      groups: [
        {
          wantsResponsible: true,
          roleLines: [{ role: 'responsable', personId: 'g1', personName: 'Group Resp' }],
        },
      ],
    }),
    { id: 'g1', name: 'Group Resp' }
  )

  assert.deepEqual(
    extractDraftResponsible({
      groups: [
        {
          wantsResponsible: true,
          responsibleId: 'same',
          driverId: 'same',
          driverName: 'Driver Resp',
        },
      ],
      conductors: [{ id: 'same', name: 'From Conductors' }],
    }),
    { id: 'same', name: 'Driver Resp' }
  )
})

test('mergeResponsibleCandidatePools dedupes by id across responsable and conductor pools', () => {
  assert.deepEqual(
    mergeResponsibleCandidatePools(
      [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bob' }],
      [{ id: 'a', name: 'Ada Driver' }, { id: 'c', name: 'Cara' }]
    ),
    [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Cara' },
    ]
  )
})

test('local availability filter keeps current line person and drops reserved others', () => {
  const pool = [
    { id: 'u1', name: 'Ada' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Cara' },
  ]
  const reserved = new Set(['u2', 'name:cara'])
  const filtered = filterPersonnelAfterLocalQuadrantCheck(pool, reserved, {
    personId: 'u2',
    personName: 'Bob',
  })
  assert.deepEqual(
    filtered.map((p) => p.id),
    ['u1', 'u2']
  )
})

test('validateNoLocalQuadrantPersonDuplicates and collectLocalExcludeIdsAndNames', () => {
  assert.equal(
    validateNoLocalQuadrantPersonDuplicates([
      { slotId: 'a', personId: 'u1', personName: 'Ada' },
      { slotId: 'b', personId: 'u2', personName: 'Bob' },
    ]),
    null
  )
  assert.match(
    validateNoLocalQuadrantPersonDuplicates([
      { slotId: 'a', personId: 'u1', personName: 'Ada' },
      { slotId: 'b', personId: 'u1', personName: 'Ada' },
    ]),
    /més d'una línia/
  )

  assert.deepEqual(
    collectLocalExcludeIdsAndNames(
      [
        { slotId: 'a', personId: 'u1', personName: 'Ada' },
        { slotId: 'b', personId: '', personName: 'Bob' },
        { slotId: 'c', personId: 'u3', personName: 'Cara' },
      ],
      'c'
    ),
    { excludeIds: ['u1'], excludeNames: ['Bob'] }
  )
})
