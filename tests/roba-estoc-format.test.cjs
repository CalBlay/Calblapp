const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  formatDaysUntilMin,
  getStockHealth,
} = require('../src/app/menu/roba-personal/robaEstocFormat')

test('stock health prioritizes articles already at or below minimum', () => {
  assert.equal(getStockHealth({ atOrBelowMin: true, daysUntilMin: 20 }), 'critical')
})

test('stock health warns when the minimum is forecast within 30 days', () => {
  assert.equal(getStockHealth({ atOrBelowMin: false, daysUntilMin: 30 }), 'warning')
  assert.equal(getStockHealth({ atOrBelowMin: false, daysUntilMin: 31 }), 'healthy')
  assert.equal(getStockHealth({ atOrBelowMin: false, daysUntilMin: null }), 'healthy')
})

test('days-until-min formatting is clear for missing and minimum values', () => {
  assert.equal(formatDaysUntilMin(null), '—')
  assert.equal(formatDaysUntilMin(0), 'Al mínim')
  assert.equal(formatDaysUntilMin(2.1), '3 dies')
})
