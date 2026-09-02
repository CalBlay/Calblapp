const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  getExternalWorkerTypeFromName,
  getExternalWorkerBaseLabel,
  normalizeExternalWorkerName,
} = require('../src/lib/quadrantExternalWorkers')

test('getExternalWorkerTypeFromName classifies ETT and center-external extras', () => {
  assert.equal(getExternalWorkerTypeFromName('ETT'), 'ett')
  assert.equal(getExternalWorkerTypeFromName('ett - Maria'), 'ett')
  assert.equal(getExternalWorkerTypeFromName('Extra C.Extern'), 'centerExternalExtra')
  assert.equal(getExternalWorkerTypeFromName('extra c.extern - Pau'), 'centerExternalExtra')
  assert.equal(getExternalWorkerTypeFromName('Joan Intern'), null)
  assert.equal(getExternalWorkerTypeFromName(''), null)
})

test('getExternalWorkerBaseLabel returns canonical prefixes', () => {
  assert.equal(getExternalWorkerBaseLabel('ett'), 'ETT')
  assert.equal(getExternalWorkerBaseLabel('centerExternalExtra'), 'Extra C.Extern')
  assert.equal(getExternalWorkerBaseLabel(null), 'ETT')
})

test('normalizeExternalWorkerName preserves suffixes and canonical prefixes', () => {
  assert.equal(normalizeExternalWorkerName({ rawName: 'ETT - Maria' }), 'ETT - Maria')
  assert.equal(
    normalizeExternalWorkerName({
      rawName: 'extra c.extern - Pau',
      type: 'centerExternalExtra',
    }),
    'Extra C.Extern - Pau'
  )
  assert.equal(normalizeExternalWorkerName({ rawName: 'ett' }), 'ETT')
  assert.equal(normalizeExternalWorkerName({ rawName: 'Extra' }), 'ETT')
  assert.equal(
    normalizeExternalWorkerName({
      rawName: 'Nova',
      type: 'centerExternalExtra',
    }),
    'Extra C.Extern - Nova'
  )
  assert.equal(normalizeExternalWorkerName({ rawName: '' }), 'ETT')
})
