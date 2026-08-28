const assert = require('node:assert/strict')
const { test } = require('node:test')

const { modelStateDocId } = require('../src/lib/cuina-central/ml/constants')
const { extractLearningFeatures } = require('../src/lib/cuina-central/ml/features')
const {
  computeWindowStats,
  confidenceFromSampleCount,
  ema,
} = require('../src/lib/cuina-central/ml/stats')

function log(partial) {
  return {
    articleId: 'art-1',
    articleCode: 'A1',
    articleName: 'Base',
    machineId: 'm-1',
    machineCode: 'M1',
    machineName: 'Cutter',
    shiftId: 's-1',
    shiftName: 'Matí',
    unit: 'kg',
    quantityProduced: 10,
    quantityRejected: 0,
    startedAt: '2026-08-28T08:00:00.000Z',
    endedAt: '2026-08-28T12:00:00.000Z',
    durationMinutes: 30,
    operatorNames: 'Anna',
    notes: '',
    customFields: {},
    ...partial,
  }
}

test('modelStateDocId joins article and machine with a double underscore', () => {
  assert.equal(modelStateDocId('art-1', 'm-9'), 'art-1__m-9')
})

test('extractLearningFeatures derives rates and defaults empty operators to 1', () => {
  const features = extractLearningFeatures(log({}))
  assert.equal(features.dateKey, '2026-08-28')
  assert.equal(features.minutesPerUnit, 3)
  assert.equal(features.qtyPerHour, 20)
  assert.equal(features.operatorCount, 1)
  assert.equal(features.dayOfWeek, new Date('2026-08-28T12:00:00.000Z').getDay())
})

test('extractLearningFeatures counts comma-separated operators and ignores blanks', () => {
  const features = extractLearningFeatures(
    log({ operatorNames: 'Anna, , Joan,  Núria  ' })
  )
  assert.equal(features.operatorCount, 3)
})

test('extractLearningFeatures zeros rates when qty or duration is not positive', () => {
  assert.deepEqual(
    extractLearningFeatures(log({ quantityProduced: 0, durationMinutes: 30 })),
    {
      dateKey: '2026-08-28',
      dayOfWeek: new Date('2026-08-28T12:00:00.000Z').getDay(),
      minutesPerUnit: 0,
      qtyPerHour: 0,
      operatorCount: 1,
    }
  )
  assert.equal(
    extractLearningFeatures(log({ quantityProduced: 10, durationMinutes: 0 }))
      .minutesPerUnit,
    0
  )
  assert.equal(
    extractLearningFeatures(log({ quantityProduced: 10, durationMinutes: 0 }))
      .qtyPerHour,
    0
  )
})

test('extractLearningFeatures uses Sunday when endedAt is unparsable', () => {
  const features = extractLearningFeatures(
    log({ endedAt: 'not-a-date', operatorNames: '' })
  )
  assert.equal(features.dayOfWeek, 0)
  assert.equal(features.dateKey, 'not-a-date')
  assert.equal(features.operatorCount, 1)
})

test('computeWindowStats drops non-positive minutes and points before sinceMs', () => {
  const empty = computeWindowStats([], 0)
  assert.deepEqual(empty, {
    sampleCount: 0,
    meanMinutesPerUnit: null,
    medianMinutesPerUnit: null,
    meanQtyPerHour: null,
    p90MinutesPerUnit: null,
  })

  const stats = computeWindowStats(
    [
      { minutesPerUnit: 0, qtyPerHour: 99, at: 100 },
      { minutesPerUnit: 2, qtyPerHour: 0, at: 50 },
      { minutesPerUnit: 4, qtyPerHour: 20, at: 100 },
      { minutesPerUnit: 6, qtyPerHour: 10, at: 200 },
    ],
    100
  )
  assert.equal(stats.sampleCount, 2)
  assert.equal(stats.meanMinutesPerUnit, 5)
  assert.equal(stats.medianMinutesPerUnit, 5)
  assert.equal(stats.meanQtyPerHour, 15)
  assert.equal(stats.p90MinutesPerUnit, 6)
})

test('computeWindowStats p90 uses the 90th percentile index, not interpolation', () => {
  const points = Array.from({ length: 10 }, (_, i) => ({
    minutesPerUnit: i + 1,
    qtyPerHour: 1,
    at: 1,
  }))
  const stats = computeWindowStats(points, 0)
  assert.equal(stats.sampleCount, 10)
  assert.equal(stats.p90MinutesPerUnit, 10)
  assert.equal(stats.medianMinutesPerUnit, 5.5)
})

test('confidenceFromSampleCount uses 5 and 20 as medium/high thresholds', () => {
  assert.equal(confidenceFromSampleCount(0), 'low')
  assert.equal(confidenceFromSampleCount(4), 'low')
  assert.equal(confidenceFromSampleCount(5), 'medium')
  assert.equal(confidenceFromSampleCount(19), 'medium')
  assert.equal(confidenceFromSampleCount(20), 'high')
})

test('ema returns the new value when previous is missing and blends otherwise', () => {
  assert.equal(ema(null, 8, 0.25), 8)
  assert.equal(ema(Number.NaN, 8, 0.25), 8)
  assert.equal(ema(10, 20, 0.25), 12.5)
})
