const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildArticleMachineMetrics,
  estimateMinutesForQuantity,
} = require('../src/lib/cuina-central/analytics')
const { dateKeyFromIso } = require('../src/lib/cuina-central/ml/constants')
const { predictFromModelState } = require('../src/lib/cuina-central/ml/predict')
const { generateWeeklyPlan } = require('../src/lib/cuina-central/planner')

const emptyWindow = {
  sampleCount: 0,
  meanMinutesPerUnit: null,
  medianMinutesPerUnit: null,
  meanQtyPerHour: null,
  p90MinutesPerUnit: null,
}

function log(partial) {
  return {
    id: 'l',
    articleId: 'art-1',
    articleCode: 'A1',
    articleName: 'Base',
    machineId: 'm-1',
    machineCode: 'M1',
    machineName: 'Cutter',
    shiftId: 's-1',
    shiftName: 'Matí',
    unit: 'kg',
    quantityProduced: 0,
    quantityRejected: 0,
    startedAt: '',
    endedAt: '',
    durationMinutes: 0,
    operatorNames: '',
    notes: '',
    customFields: {},
    createdAt: null,
    updatedAt: null,
    ...partial,
  }
}

test('dateKeyFromIso keeps the calendar date prefix from an ISO timestamp', () => {
  assert.equal(dateKeyFromIso('2026-08-26T23:59:59.000Z'), '2026-08-26')
  assert.equal(dateKeyFromIso('2026-01-02'), '2026-01-02')
})

test('buildArticleMachineMetrics skips empty qty/duration and falls back to ISO elapsed time', () => {
  const metrics = buildArticleMachineMetrics(
    [
      log({ quantityProduced: 0, durationMinutes: 30 }),
      log({
        quantityProduced: 2,
        durationMinutes: 0,
        startedAt: 'not-iso',
        endedAt: '2026-08-26T09:00:00.000Z',
      }),
      log({
        quantityProduced: 2,
        durationMinutes: 10,
        endedAt: '2026-08-26T10:00:00.000Z',
      }),
      log({
        quantityProduced: 2,
        durationMinutes: 20,
        endedAt: '2026-08-26T11:00:00.000Z',
      }),
    ],
    [{ articleId: 'art-1', machineId: 'm-1', qtyPerHour: 10 }]
  )

  assert.equal(metrics.length, 1)
  assert.equal(metrics[0].sampleCount, 2)
  assert.equal(metrics[0].medianMinutesPerUnit, 7.5)
  assert.equal(metrics[0].medianQtyPerHour, 8)
  assert.equal(metrics[0].efficiencyRatio, 0.8)
  assert.equal(metrics[0].lastLogAt, '2026-08-26T11:00:00.000Z')
})

test('estimateMinutesForQuantity prefers learned minutes then theoretical rate', () => {
  const metrics = [
    { articleId: 'art-1', machineId: 'm-1', medianMinutesPerUnit: 1.2 },
  ]
  assert.deepEqual(estimateMinutesForQuantity(metrics, 'art-1', 'm-1', 10, 60), {
    minutes: 12,
    source: 'learned',
  })
  assert.deepEqual(estimateMinutesForQuantity([], 'art-1', 'm-1', 10, 20), {
    minutes: 30,
    source: 'theoretical',
  })
  assert.deepEqual(estimateMinutesForQuantity([], 'art-1', 'm-1', 10, 0), {
    minutes: 0,
    source: 'unknown',
  })
  assert.deepEqual(estimateMinutesForQuantity(metrics, 'art-1', 'm-1', 0, 60), {
    minutes: 0,
    source: 'unknown',
  })
})

test('predictFromModelState uses ml, blend, or theoretical by confidence', () => {
  const ml = predictFromModelState(
    {
      predictedMinutesPerUnit: 2,
      predictedQtyPerHour: 30,
      theoreticalQtyPerHour: 40,
      confidence: 'high',
      allTime: { ...emptyWindow, sampleCount: 25 },
    },
    10
  )
  assert.equal(ml.source, 'ml')
  assert.equal(ml.estimatedMinutes, 20)

  const blend = predictFromModelState(
    {
      predictedMinutesPerUnit: 2,
      theoreticalQtyPerHour: 60,
      confidence: 'low',
      allTime: { ...emptyWindow, sampleCount: 10 },
    },
    10
  )
  assert.equal(blend.source, 'blend')
  assert.equal(blend.estimatedMinutes, 15)

  const theoretical = predictFromModelState(
    { theoreticalQtyPerHour: 30, confidence: 'low', allTime: emptyWindow },
    10
  )
  assert.equal(theoretical.source, 'theoretical')
  assert.equal(theoretical.estimatedMinutes, 20)

  const unknown = predictFromModelState(null, 10)
  assert.equal(unknown.source, 'unknown')
  assert.equal(unknown.estimatedMinutes, 0)
})

test('generateWeeklyPlan skips inactive machines and records overtime when capacity is short', () => {
  const machine = {
    id: 'm-1',
    code: 'M1',
    name: 'Cutter',
    location: '',
    zone: '',
    mapX: null,
    mapY: null,
    active: true,
    customFields: {},
    createdAt: null,
    updatedAt: null,
  }
  const shift = {
    id: 's-1',
    code: 'MATI',
    name: 'Matí',
    startTime: '08:00',
    endTime: '08:10',
    durationMinutes: 10,
    sortOrder: 1,
    active: true,
    customFields: {},
    createdAt: null,
    updatedAt: null,
  }
  const need = {
    articleId: 'art-1',
    articleCode: 'A1',
    articleName: 'Base',
    quantity: 10,
    unit: 'kg',
  }
  const rate = {
    id: 'r1',
    machineId: 'm-1',
    machineCode: 'M1',
    machineName: 'Cutter',
    articleId: 'art-1',
    articleCode: 'A1',
    articleName: 'Base',
    unit: 'kg',
    qtyPerHour: 6,
    notes: '',
    customFields: {},
    createdAt: null,
    updatedAt: null,
  }

  const inactive = generateWeeklyPlan({
    weekStart: '2026-08-24',
    needs: [need],
    shifts: [shift],
    machines: [{ ...machine, active: false }],
    rates: [rate],
    logs: [],
    modelStates: [],
    operatorCountByShift: { 's-1': 1 },
  })
  assert.equal(inactive.slots.length, 0)
  assert.ok(inactive.warnings.some((w) => w.includes('Sense rendiment')))

  const short = generateWeeklyPlan({
    weekStart: '2026-08-24',
    needs: [need],
    shifts: [shift],
    machines: [machine],
    rates: [rate],
    logs: [],
    modelStates: [],
    operatorCountByShift: { 's-1': 1 },
  })
  // 10 units / 6 per hour → ceil(100) minutes; 7 days * 10 min = 70 capacity
  assert.equal(short.totalCapacityMinutes, 70)
  assert.equal(short.totalEstimatedMinutes, 100)
  assert.equal(short.overtimeMinutes, 30)
  assert.ok(short.warnings.some((w) => w.includes('Capacitat insuficient')))
  assert.ok(short.slots.length > 0)
  assert.equal(
    short.slots.reduce((sum, slot) => sum + slot.estimatedMinutes, 0),
    70
  )
})
