const assert = require('node:assert/strict')
const { test } = require('node:test')

const { normalizeTornWorker } = require('../src/utils/normalizeTornWorker')

test('normalizeTornWorker maps historical id/name/plate fields and folds department', () => {
  const worker = normalizeTornWorker({
    workerId: 'u-1',
    nom: '  Anna  ',
    role: 'Responsable',
    startTime: '0930',
    endTime: '18:00',
    meetingPoint: '  Porta  ',
    department: 'Producció',
    vehicle: { plate: '  1234ABC  ' },
  })

  assert.equal(worker.key, 'u-1')
  assert.equal(worker.id, 'u-1')
  assert.equal(worker.name, 'Anna')
  assert.equal(worker.role, 'responsable')
  assert.equal(worker.startTime, '09:30')
  assert.equal(worker.endTime, '18:00')
  assert.equal(worker.meetingPoint, 'Porta')
  assert.equal(worker.department, 'produccio')
  assert.equal(worker.plate, '1234ABC')
})

test('normalizeTornWorker prefers email over missing ids and defaults unknown roles', () => {
  const worker = normalizeTornWorker({
    email: 'anna@calblay.com',
    displayName: 'Anna',
    role: 'operari',
    startTime: '',
    matricula: 'B-111',
  })

  assert.equal(worker.id, 'anna@calblay.com')
  assert.equal(worker.key, 'anna@calblay.com')
  assert.equal(worker.role, 'treballador')
  assert.equal(worker.startTime, '')
  assert.equal(worker.plate, 'B-111')
  assert.equal(worker.department, 'sense departament')
})

test('normalizeTornWorker treats conductor aliases and null input safely', () => {
  assert.equal(normalizeTornWorker({ name: 'Pau', role: 'Conductor' }).role, 'conductor')
  assert.equal(normalizeTornWorker({ name: 'Pau', role: 'con' }).role, 'conductor')

  const empty = normalizeTornWorker(null)
  assert.equal(empty.key, '')
  assert.equal(empty.id, undefined)
  assert.equal(empty.name, '')
  assert.equal(empty.role, 'treballador')
  assert.equal(empty.department, 'sense departament')
  assert.equal(empty.plate, undefined)
})

test('normalizeTornWorker keys unnamed workers by folded name when no id is present', () => {
  const worker = normalizeTornWorker({ name: '  Núria  ' })
  assert.equal(worker.id, undefined)
  assert.equal(worker.key, 'nuria')
  assert.equal(worker.name, 'Núria')
})
