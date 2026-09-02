const assert = require('node:assert/strict')
const { test } = require('node:test')

const { isIsoDateDayParam } = require('../src/lib/firestoreStageRangeQuery')

test('isIsoDateDayParam accepts YYYY-MM-DD and datetime prefixes used by range APIs', () => {
  assert.equal(isIsoDateDayParam('2026-08-11'), true)
  assert.equal(isIsoDateDayParam('2026-08-11T10:00:00'), true)
  assert.equal(isIsoDateDayParam('2026-08-11 extra'), true)
})

test('isIsoDateDayParam rejects empty, short, or non-ISO day strings', () => {
  assert.equal(isIsoDateDayParam(''), false)
  assert.equal(isIsoDateDayParam('2026-08-1'), false)
  assert.equal(isIsoDateDayParam('11/08/2026'), false)
  assert.equal(isIsoDateDayParam('not-a-date'), false)
  assert.equal(isIsoDateDayParam('2026/08/11'), false)
})
