const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  buildDraftEditorModel,
  pruneEditorGroups,
  buildGroupedDraftPersistence,
} = require('../src/lib/quadrantsDraftEditor')

const {
  createManualAssignGroup,
} = require('../src/lib/manualAssignModel')

test('buildDraftEditorModel expands serveis roleLines including multiple responsables', () => {
  const model = buildDraftEditorModel({
    id: 'draft-1',
    department: 'serveis',
    startDate: '2026-07-20',
    endDate: '2026-07-21',
    startTime: '10:00',
    endTime: '18:00',
    meetingPoint: 'Entrada',
    groups: [
      {
        id: 'group-a',
        serviceDate: '2026-07-20',
        startTime: '10:00',
        endTime: '18:00',
        meetingPoint: 'Entrada',
        roleLines: [
          {
            slotId: 's1',
            role: 'responsable',
            personId: 'r1',
            personName: 'Anna Cap',
            serviceDate: '2026-07-20',
            startTime: '10:00',
            endTime: '18:00',
          },
          {
            slotId: 's2',
            role: 'responsable',
            personId: 'r2',
            personName: 'Bernat Cap',
            serviceDate: '2026-07-20',
            startTime: '11:00',
            endTime: '19:00',
          },
          {
            slotId: 's3',
            role: 'conductor',
            personId: 'c1',
            personName: 'Carla Conduc',
          },
          {
            slotId: 's4',
            role: 'treballador',
            personId: 't1',
            personName: 'Dani Obrer',
          },
          {
            slotId: 's5',
            role: 'jamonero',
            personId: 'j1',
            personName: 'Elena Jamon',
          },
          {
            slotId: 'empty',
            role: 'treballador',
            personId: '',
            personName: '',
          },
        ],
      },
    ],
  })

  assert.equal(model.hasStructuredGroups, true)
  assert.equal(model.rows.length, 5)

  const responsables = model.rows.filter((row) => row.role === 'responsable')
  assert.equal(responsables.length, 2)
  assert.deepEqual(
    responsables.map((row) => row.name).sort(),
    ['Anna Cap', 'Bernat Cap']
  )
  assert.equal(
    model.rows.find((row) => row.name === 'Elena Jamon')?.isJamonero,
    true
  )
  assert.equal(
    model.rows.find((row) => row.name === 'Elena Jamon')?.role,
    'treballador'
  )
})

test('buildDraftEditorModel assigns draft.responsables to matching group ids', () => {
  const model = buildDraftEditorModel({
    id: 'draft-2',
    department: 'serveis',
    startDate: '2026-07-20',
    endDate: '2026-07-20',
    startTime: '09:00',
    endTime: '17:00',
    meetingPoint: 'Pati',
    responsables: [
      { id: 'r1', name: 'Anna Cap', groupId: 'group-b' },
      { id: 'r2', name: 'Bernat Cap', groupId: 'group-a' },
    ],
    conductors: [{ id: 'c1', name: 'Carla Conduc' }],
    treballadors: [{ id: 't1', name: 'Dani Obrer' }],
    groups: [
      {
        id: 'group-a',
        serviceDate: '2026-07-20',
        workers: 2,
        drivers: 1,
        wantsResponsible: true,
      },
      {
        id: 'group-b',
        serviceDate: '2026-07-20',
        workers: 1,
        drivers: 0,
        wantsResponsible: true,
      },
    ],
  })

  const groupAResp = model.rows.filter(
    (row) => row.groupId === 'group-a' && row.role === 'responsable'
  )
  const groupBResp = model.rows.filter(
    (row) => row.groupId === 'group-b' && row.role === 'responsable'
  )

  assert.deepEqual(
    groupAResp.map((row) => row.name),
    ['Bernat Cap']
  )
  assert.deepEqual(
    groupBResp.map((row) => row.name),
    ['Anna Cap']
  )
})

test('pruneEditorGroups drops empty serveis groups but keeps useful logistics shells', () => {
  const groups = [
    { id: 'keep-rows', workers: 0, drivers: 0 },
    { id: 'drop-empty', workers: 2, drivers: 1, responsibleName: 'Legacy' },
    { id: 'logistics-shell', workers: 3, drivers: 1 },
  ]
  const rows = [{ groupId: 'keep-rows', role: 'treballador', id: 't1', name: 'A', startDate: '', startTime: '', endDate: '', endTime: '' }]

  assert.deepEqual(
    pruneEditorGroups({ department: 'serveis', rows, groups }).map((g) => g.id),
    ['keep-rows']
  )
  assert.deepEqual(
    pruneEditorGroups({ department: 'logistica', rows, groups }).map((g) => g.id).sort(),
    ['keep-rows', 'logistics-shell']
  )
})

test('buildGroupedDraftPersistence counts unique people and keeps first responsable', () => {
  const persisted = buildGroupedDraftPersistence({
    groups: [{ id: 'group-a', serviceDate: '2026-07-20' }],
    rows: [
      {
        role: 'responsable',
        id: 'r1',
        name: 'Anna Cap',
        groupId: 'group-a',
        startDate: '2026-07-20',
        startTime: '10:00',
        endDate: '2026-07-20',
        endTime: '18:00',
        meetingPoint: 'Entrada',
      },
      {
        role: 'responsable',
        id: 'r2',
        name: 'Bernat Cap',
        groupId: 'group-a',
        startDate: '2026-07-20',
        startTime: '10:00',
        endDate: '2026-07-20',
        endTime: '18:00',
      },
      {
        role: 'conductor',
        id: 'c1',
        name: 'Carla Conduc',
        groupId: 'group-a',
        startDate: '2026-07-20',
        startTime: '10:00',
        endDate: '2026-07-20',
        endTime: '18:00',
      },
      {
        role: 'treballador',
        id: '',
        name: 'Extra',
        groupId: 'group-a',
        startDate: '2026-07-20',
        startTime: '10:00',
        endDate: '2026-07-20',
        endTime: '18:00',
      },
    ],
  })

  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].workers, 4) // 3 named + Extra
  assert.equal(persisted[0].drivers, 1)
  assert.equal(persisted[0].responsibleName, 'Anna Cap')
  assert.equal(persisted[0].responsibleId, 'r1')
})

test('createManualAssignGroup advances serviceDate across multi-day drafts', () => {
  const draft = {
    id: 'draft-3',
    department: 'serveis',
    startDate: '2026-07-20',
    endDate: '2026-07-22',
    startTime: '10:00',
    endTime: '18:00',
  }

  const day2 = createManualAssignGroup({
    draft,
    meetingPoint: 'Entrada',
    startTime: '10:00',
    endTime: '18:00',
    source: { id: 'group-1', serviceDate: '2026-07-20' },
  })
  assert.equal(day2.serviceDate, '2026-07-21')

  const day3 = createManualAssignGroup({
    draft,
    meetingPoint: 'Entrada',
    startTime: '10:00',
    endTime: '18:00',
    source: { id: 'group-2', serviceDate: '2026-07-21' },
  })
  assert.equal(day3.serviceDate, '2026-07-22')

  const capped = createManualAssignGroup({
    draft,
    meetingPoint: 'Entrada',
    startTime: '10:00',
    endTime: '18:00',
    source: { id: 'group-3', serviceDate: '2026-07-22' },
  })
  assert.equal(capped.serviceDate, '2026-07-22')

  const singleDay = createManualAssignGroup({
    draft: { ...draft, endDate: '2026-07-20' },
    meetingPoint: 'Entrada',
    startTime: '10:00',
    endTime: '18:00',
    source: { id: 'group-1', serviceDate: '2026-07-20' },
  })
  assert.equal(singleDay.serviceDate, '2026-07-20')
})
