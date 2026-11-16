const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  getExternalWorkerTypeFromName,
  isReusableExternalExtra,
} = require('../src/lib/quadrantExternalWorkers')

test('external extra aliases are recognized as reusable generic slots', () => {
  assert.equal(getExternalWorkerTypeFromName('Extra C.Extern'), 'centerExternalExtra')
  assert.equal(getExternalWorkerTypeFromName('Extra C Extern'), 'centerExternalExtra')
  assert.equal(getExternalWorkerTypeFromName('Extra extern'), 'centerExternalExtra')
  assert.equal(isReusableExternalExtra({ name: 'Extra C.Extern - pendent' }), true)
  assert.equal(isReusableExternalExtra({ externalType: 'centerExternalExtra' }), true)
})

test('internal workers and ETT slots keep their existing identity rules', () => {
  assert.equal(isReusableExternalExtra({ name: 'Anna Puig' }), false)
  assert.equal(isReusableExternalExtra({ name: 'ETT' }), false)
  assert.equal(isReusableExternalExtra({ externalType: 'ett' }), false)
})
