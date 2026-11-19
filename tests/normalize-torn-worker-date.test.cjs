const assert = require('node:assert/strict')
const { test } = require('node:test')

const { normalizeTornWorker } = require('../src/utils/normalizeTornWorker')
const {
  splitWorkersByEffectiveDate,
  workersForServiceGroup,
} = require('../src/services/tornsService')

test('turn worker normalization preserves the effective role-line date', () => {
  const worker = normalizeTornWorker({
    id: 'worker-1',
    name: 'Digno Belliard',
    role: 'conductor',
    serviceDate: '2026-11-16',
    startTime: '15:00',
    endTime: '19:00',
  })

  assert.equal(worker.startDate, '2026-11-16')
  assert.equal(worker.endDate, '2026-11-16')
})

test('service turns are grouped by the role-line date instead of the event header date', () => {
  const worker = normalizeTornWorker({
    id: 'worker-1',
    name: 'Digno Belliard',
    role: 'conductor',
    serviceDate: '2026-11-16',
    startTime: '15:00',
    endTime: '19:00',
  })

  const schedules = splitWorkersByEffectiveDate([worker], '2026-11-17')
  assert.deepEqual(
    schedules.map((schedule) => ({
      date: schedule.date,
      names: schedule.workers.map((entry) => entry.name),
    })),
    [{ date: '2026-11-16', names: ['Digno Belliard'] }]
  )
})

test('a service responsible is only included in their own shift', () => {
  const responsible = normalizeTornWorker({
    id: 'responsible-1',
    name: 'Anna',
    role: 'responsable',
    groupId: 'shift-morning',
  })

  assert.deepEqual(
    workersForServiceGroup([responsible], 'shift-morning').map((worker) => worker.name),
    ['Anna']
  )
  assert.deepEqual(workersForServiceGroup([responsible], 'shift-evening'), [])
})
