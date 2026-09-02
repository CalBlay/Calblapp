const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  OPERATIONAL_AREA_LABELS,
} = require('../src/lib/operationalAreas')

test('operational area icons use one shared label mapping', () => {
  assert.deepEqual(OPERATIONAL_AREA_LABELS, {
    commercial: 'Comercial',
    cuina: 'Cuina',
    serveis: 'Serveis',
    logistica: 'Logística',
  })
})
