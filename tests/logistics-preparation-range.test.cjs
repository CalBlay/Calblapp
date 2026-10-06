const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  getPreparationPlanningDate,
  isPreparationPlanningDateInRange,
} = require('../src/lib/logistics/preparationRange')

test('uses the event or service date while preparation has no date', () => {
  assert.equal(getPreparationPlanningDate('', '2026-10-13'), '2026-10-13')
  assert.equal(isPreparationPlanningDateInRange('', '2026-10-13', '2026-10-12', '2026-10-18'), true)
})

test('uses preparation date instead of event date once it is planned', () => {
  assert.equal(getPreparationPlanningDate('2026-10-11', '2026-10-13'), '2026-10-11')
  assert.equal(
    isPreparationPlanningDateInRange('2026-10-11', '2026-10-13', '2026-10-12', '2026-10-18'),
    false
  )
  assert.equal(
    isPreparationPlanningDateInRange('2026-10-11', '2026-10-13', '2026-10-05', '2026-10-11'),
    true
  )
})

test('falls back to the event date when preparation date is malformed', () => {
  assert.equal(getPreparationPlanningDate('11/10/2026', '2026-10-13'), '2026-10-13')
})
