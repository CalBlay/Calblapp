const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parseTimeToMinutes,
  diffHours,
  matchesFilters,
  collectPersonLines,
} = require('../src/lib/informes/buildEventsWorkersOverview')

function baseEntry(overrides = {}) {
  return {
    eventId: 'E1',
    eventCode: 'E1',
    eventName: 'Casament',
    eventDate: '2026-07-01',
    department: 'Serveis',
    location: 'Mas Blay',
    workerName: 'Anna Puig',
    role: 'treballador',
    isResponsible: false,
    plannedStartTime: '10:00',
    plannedEndTime: '14:00',
    realEndTime: '',
    plannedHours: 4,
    actualHours: 4,
    noShow: false,
    leftEarly: false,
    notes: '',
    ...overrides,
  }
}

test('parseTimeToMinutes accepts HH:mm and rejects invalid shapes', () => {
  assert.equal(parseTimeToMinutes('09:30'), 9 * 60 + 30)
  assert.equal(parseTimeToMinutes('00:00'), 0)
  assert.equal(parseTimeToMinutes('9:30'), null)
  assert.equal(parseTimeToMinutes('10:0'), null)
  assert.equal(parseTimeToMinutes(''), null)
  assert.equal(parseTimeToMinutes(null), null)
})

test('diffHours handles same-day and overnight spans', () => {
  assert.equal(diffHours('10:00', '14:00'), 4)
  assert.equal(diffHours('22:00', '02:00'), 4)
  assert.equal(diffHours('10:00', '10:00'), 0)
  assert.equal(diffHours('10:00', ''), 0)
  assert.equal(diffHours(undefined, '14:00'), 0)
})

test('matchesFilters is accent-insensitive and can require closed real end times', () => {
  const entry = baseEntry({
    department: 'Cuina',
    workerName: 'Sònia Albet',
    role: 'responsable',
    realEndTime: '',
  })

  assert.equal(matchesFilters(entry), true)
  assert.equal(matchesFilters(entry, { department: 'cuina' }), true)
  assert.equal(matchesFilters(entry, { workerName: 'sonia albet' }), true)
  assert.equal(matchesFilters(entry, { role: 'RESPONSABLE' }), true)
  assert.equal(matchesFilters(entry, { department: 'serveis' }), false)
  assert.equal(matchesFilters(entry, { onlyClosed: true }), false)
  assert.equal(
    matchesFilters(
      baseEntry({ realEndTime: '15:00' }),
      { onlyClosed: true }
    ),
    true
  )
})

test('collectPersonLines flattens legacy responsableName and person arrays', () => {
  const lines = collectPersonLines({
    department: 'Logistica',
    startTime: '08:00',
    endTime: '16:00',
    responsableName: 'Marc Riu',
    conductors: [{ name: 'Paula', startTime: '09:00', endTime: '12:00' }],
    treballadors: [
      {
        name: 'Joan',
        time: '08:30',
        endTime: '15:00',
        endTimeReal: '14:30',
        noShow: false,
        leftEarly: true,
        sortidaNotes: 'Sortida anticipada',
      },
    ],
    workers: [{ name: '  ', startTime: '10:00' }, { name: 'Núria', hour: '10:00' }],
  })

  assert.equal(lines.length, 4)

  const responsable = lines.find((line) => line.role === 'responsable')
  assert.ok(responsable)
  assert.equal(responsable.name, 'Marc Riu')
  assert.equal(responsable.isResponsible, true)
  assert.equal(responsable.plannedStartTime, '08:00')
  assert.equal(responsable.plannedEndTime, '16:00')

  const conductor = lines.find((line) => line.role === 'conductor')
  assert.equal(conductor.name, 'Paula')
  assert.equal(conductor.plannedStartTime, '09:00')
  assert.equal(conductor.plannedEndTime, '12:00')

  const joan = lines.find((line) => line.name === 'Joan')
  assert.equal(joan.role, 'treballador')
  assert.equal(joan.plannedStartTime, '08:30')
  assert.equal(joan.realEndTime, '14:30')
  assert.equal(joan.leftEarly, true)
  assert.equal(joan.notes, 'Sortida anticipada')

  const nuria = lines.find((line) => line.name === 'Núria')
  assert.equal(nuria.plannedStartTime, '10:00')
  assert.equal(nuria.plannedEndTime, '16:00')
})

test('collectPersonLines prefers structured responsable over responsableName', () => {
  const lines = collectPersonLines({
    department: 'Serveis',
    startTime: '11:00',
    endTime: '18:00',
    responsable: { name: 'Primary', startTime: '11:30', endTime: '17:00', noShow: true },
    responsableName: 'Legacy Name',
  })

  assert.equal(lines.length, 1)
  assert.equal(lines[0].name, 'Primary')
  assert.equal(lines[0].plannedStartTime, '11:30')
  assert.equal(lines[0].noShow, true)
})
