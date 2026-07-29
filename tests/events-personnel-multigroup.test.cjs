const test = require('node:test')
const assert = require('node:assert/strict')

const {
  extractPersonnelLinesFromQuadrant,
  applyClosingUpdatesToPersonArray,
  applyClosingUpdatesToGroups,
} = require('../src/lib/eventsPersonnelFromQuadrant.ts')

test('extractPersonnelLinesFromQuadrant includes responsables[] beyond top-level name', () => {
  const lines = extractPersonnelLinesFromQuadrant({
    department: 'cuina',
    meetingPoint: 'Cuina',
    startTime: '08:00',
    endTime: '16:00',
    responsableName: 'Anna Primària',
    responsables: [
      { name: 'Anna Primària', meetingPoint: 'Cuina' },
      { name: 'Bernat Segon', meetingPoint: 'Pastisseria', time: '09:00', endTime: '17:00' },
    ],
    conductors: [],
    treballadors: [{ name: 'Carla Worker', time: '10:00' }],
  })

  const names = lines.filter((line) => line.role === 'responsable').map((line) => line.name)
  assert.ok(names.includes('Anna Primària'))
  assert.ok(names.includes('Bernat Segon'))
  const bernat = lines.find((line) => line.name === 'Bernat Segon')
  assert.equal(bernat.meetingPoint, 'Pastisseria')
  assert.equal(bernat.time, '09:00')
  assert.equal(bernat.endTime, '17:00')
})

test('extractPersonnelLinesFromQuadrant reads groups responsibleName and roleLines', () => {
  const lines = extractPersonnelLinesFromQuadrant({
    department: 'cuina',
    startTime: '07:00',
    endTime: '15:00',
    responsableName: 'Only First',
    groups: [
      {
        responsibleName: 'Only First',
        meetingPoint: 'G1',
        startTime: '07:00',
        endTime: '15:00',
        roleLines: [{ role: 'responsable', personName: 'Only First' }],
      },
      {
        responsibleName: 'Second Group Resp',
        meetingPoint: 'G2',
        startTime: '08:30',
        endTime: '16:30',
        roleLines: [
          { role: 'responsable', personName: 'Second Group Resp', meetingPoint: 'G2-line' },
          { role: 'treballador', personName: 'Should Ignore' },
        ],
      },
    ],
  })

  const responsables = lines.filter((line) => line.role === 'responsable')
  const names = responsables.map((line) => line.name)
  assert.ok(names.includes('Only First'))
  assert.ok(names.includes('Second Group Resp'))
  assert.ok(!lines.some((line) => line.name === 'Should Ignore'))
  const secondLines = responsables.filter((line) => line.name === 'Second Group Resp')
  assert.ok(secondLines.length >= 1)
  assert.ok(secondLines.some((line) => line.meetingPoint === 'G2' || line.meetingPoint === 'G2-line'))
  assert.ok(secondLines.some((line) => line.time === '08:30'))
})

test('applyClosingUpdatesToPersonArray writes endTimeReal onto responsables[]', () => {
  const updated = applyClosingUpdatesToPersonArray(
    [
      { name: 'Anna Primària' },
      { name: 'Bernat Segon' },
    ],
    [{ name: 'Bernat Segon', endTimeReal: '18:15', notes: 'ok', noShow: false }],
    { userId: 'u1', ts: '2026-07-29T12:00:00.000Z' }
  )

  assert.equal(updated[0].endTimeReal, undefined)
  assert.equal(updated[1].endTimeReal, '18:15')
  assert.equal(updated[1].sortidaNotes, 'ok')
  assert.equal(updated[1].sortidaSetBy.userId, 'u1')
})

test('applyClosingUpdatesToGroups mirrors closing onto responsibleName and roleLines', () => {
  const updated = applyClosingUpdatesToGroups(
    [
      {
        id: 'g1',
        responsibleName: 'Only First',
        roleLines: [{ role: 'responsable', personName: 'Only First' }],
      },
      {
        id: 'g2',
        responsibleName: 'Second Group Resp',
        roleLines: [
          { role: 'responsable', personName: 'Second Group Resp' },
          { role: 'treballador', personName: 'Worker' },
        ],
      },
    ],
    [{ name: 'Second Group Resp', endTimeReal: '19:00', noShow: false, leftEarly: true }],
    { userId: 'u2', ts: '2026-07-29T12:00:00.000Z' }
  )

  assert.equal(updated[0].responsibleEndTimeReal, undefined)
  assert.equal(updated[1].responsibleEndTimeReal, '19:00')
  assert.equal(updated[1].responsibleLeftEarly, true)
  assert.equal(updated[1].roleLines[0].endTimeReal, '19:00')
  assert.equal(updated[1].roleLines[1].endTimeReal, undefined)
})
