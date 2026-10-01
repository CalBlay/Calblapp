const test = require('node:test')
const assert = require('node:assert/strict')
const { groupEventsWorkersByEvent } = require('../src/lib/informes/eventsWorkersByEvent')

const base = {
  eventId: 'EV-1',
  eventCode: 'EV-1',
  eventName: 'Sopar empresa',
  eventDate: '2026-09-30',
  location: 'Finca',
  role: 'treballador',
  isResponsible: false,
  plannedEndTime: '23:00',
  plannedHours: 7,
  actualHours: 8,
  noShow: false,
  leftEarly: false,
  isEtt: false,
  notes: '',
}

test('groups event workers by department and preserves operational closing time', () => {
  const groups = groupEventsWorkersByEvent([
    {
      ...base,
      department: 'Serveis',
      workerName: 'Berta',
      plannedStartTime: '16:00',
      realEndTime: '00:00',
    },
    {
      ...base,
      department: 'Cuina',
      workerName: 'Anna',
      plannedStartTime: '15:00',
      realEndTime: '',
    },
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].workersCount, 2)
  assert.equal(groups[0].closedCount, 1)
  assert.deepEqual(
    groups[0].departments.map((department) => department.department),
    ['Cuina', 'Serveis']
  )
  assert.equal(groups[0].departments[1].rows[0].plannedStartTime, '16:00')
  assert.equal(groups[0].departments[1].rows[0].realEndTime, '00:00')
  assert.equal(groups[0].departments[0].rows[0].realEndTime, '')
})

test('excludes no-shows and ETT personnel even when ETT is at the end of the name', () => {
  const groups = groupEventsWorkersByEvent([
    {
      ...base,
      department: 'Serveis',
      workerName: 'Jordi',
      plannedStartTime: '16:00',
      realEndTime: '',
      noShow: true,
      actualHours: 0,
    },
    {
      ...base,
      department: 'Serveis',
      workerName: 'ETT - 1',
      plannedStartTime: '16:00',
      realEndTime: '23:00',
      isEtt: true,
    },
    {
      ...base,
      department: 'Serveis',
      workerName: 'Treballador temporal ETT',
      plannedStartTime: '16:00',
      realEndTime: '23:00',
      isEtt: false,
    },
  ])

  assert.deepEqual(groups, [])
})

test('merges multiple roles for the same worker into one row', () => {
  const groups = groupEventsWorkersByEvent([
    {
      ...base,
      department: 'Logística',
      workerName: 'Pau',
      role: 'responsable',
      isResponsible: true,
      plannedStartTime: '16:00',
      realEndTime: '',
    },
    {
      ...base,
      department: 'Logística',
      workerName: 'Pau',
      role: 'conductor',
      plannedStartTime: '15:00',
      realEndTime: '23:30',
      actualHours: 8.5,
    },
  ])

  const rows = groups[0].departments[0].rows
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].roles, ['responsable', 'conductor'])
  assert.equal(rows[0].plannedStartTime, '15:00')
  assert.equal(rows[0].realEndTime, '23:30')
  assert.equal(rows[0].actualHours, 8.5)
})

test('sorts events chronologically from the first day to the last day', () => {
  const groups = groupEventsWorkersByEvent([
    {
      ...base,
      eventId: 'EV-OLD',
      eventDate: '2026-09-01',
      department: 'Serveis',
      workerName: 'Joan',
      plannedStartTime: '10:00',
      realEndTime: '18:00',
    },
    {
      ...base,
      eventId: 'EV-NEW',
      eventDate: '2026-09-30',
      department: 'Serveis',
      workerName: 'Maria',
      plannedStartTime: '10:00',
      realEndTime: '18:00',
    },
  ])

  assert.deepEqual(groups.map((event) => event.eventId), ['EV-OLD', 'EV-NEW'])
})

test('calculates each worker total official hours across the selected period without duplicating roles', () => {
  const groups = groupEventsWorkersByEvent([
    {
      ...base,
      eventId: 'EV-1',
      department: 'Serveis',
      workerName: 'Pau',
      role: 'responsable',
      plannedStartTime: '16:00',
      realEndTime: '00:00',
      actualHours: 8,
    },
    {
      ...base,
      eventId: 'EV-1',
      department: 'Serveis',
      workerName: 'Pau',
      role: 'conductor',
      plannedStartTime: '16:00',
      realEndTime: '00:00',
      actualHours: 8,
    },
    {
      ...base,
      eventId: 'EV-2',
      eventDate: '2026-10-01',
      department: 'Serveis',
      workerName: 'Pau',
      plannedStartTime: '10:00',
      realEndTime: '14:30',
      actualHours: 4.5,
    },
  ])

  const rows = groups.flatMap((event) =>
    event.departments.flatMap((department) => department.rows)
  )
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.periodActualHours === 12.5))
})
