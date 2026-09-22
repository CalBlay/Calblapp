const test = require('node:test')
const assert = require('node:assert/strict')

const {
  addYearsToDateKey,
  getTachographReviewInfo,
  normalizeTachographReviewDates,
} = require('../src/lib/transportTachograph.ts')

test('tachograph review dates are valid, unique, and ordered', () => {
  assert.deepEqual(
    normalizeTachographReviewDates(['2028-05-10', 'bad', '2026-05-10', '2028-05-10']),
    ['2026-05-10', '2028-05-10']
  )
})

test('tachograph next review is two years after the latest completed review', () => {
  const info = getTachographReviewInfo(
    ['2024-06-15', '2026-06-20'],
    new Date('2027-01-01T12:00:00')
  )

  assert.equal(info.latestReviewDate, '2026-06-20')
  assert.equal(info.nextReviewDate, '2028-06-20')
  assert.equal(info.state, 'ok')
})

test('tachograph review becomes overdue and leap dates stay valid', () => {
  assert.equal(addYearsToDateKey('2024-02-29', 2), '2026-02-28')
  assert.equal(
    getTachographReviewInfo(['2024-06-15'], new Date('2026-06-16T12:00:00')).state,
    'overdue'
  )
})
