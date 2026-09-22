const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  DEFAULT_TRANSPORT_TYPE_DEFINITIONS,
  normalizeTransportPlateKey,
  normalizeTransportType,
} = require('../src/lib/transportTypes')

test('default transport type characteristics preserve fleet behavior', () => {
  const largeColdTruck = DEFAULT_TRANSPORT_TYPE_DEFINITIONS.find(
    (type) => type.value === 'camioGranFred'
  )
  assert.equal(largeColdTruck.requiresLargeTruckLicense, true)
  assert.equal(largeColdTruck.refrigeratedByDefault, true)
  assert.equal(largeColdTruck.tachographRequired, true)
  assert.equal(largeColdTruck.serviceIntervalKm, 40000)
})

test('normalizeTransportPlateKey strips separators and lower-case letters', () => {
  assert.equal(normalizeTransportPlateKey('1234-bcd'), '1234BCD')
  assert.equal(normalizeTransportPlateKey('  1234 BCD  '), '1234BCD')
  assert.equal(normalizeTransportPlateKey('1234.BCD'), '1234BCD')
  assert.equal(normalizeTransportPlateKey(null), '')
  assert.equal(normalizeTransportPlateKey(''), '')
})

test('normalizeTransportType keeps catalog values and maps aliases', () => {
  assert.equal(normalizeTransportType('furgonetaMitjana'), 'furgonetaMitjana')
  assert.equal(normalizeTransportType('Furgoneta'), 'furgonetaMitjana')
  assert.equal(normalizeTransportType('furgoneta petita'), 'furgonetaPetita')
  assert.equal(normalizeTransportType('camió petit'), 'transport')
  assert.equal(normalizeTransportType('camio p plataforma fred'), 'camioPPlataformaFred')
  assert.equal(normalizeTransportType(''), '')
  assert.equal(normalizeTransportType(undefined), '')
  assert.equal(normalizeTransportType('unknown-van'), 'unknown-van')
})
