const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  requiresBigTruckLicense,
  canDriverHandleVehicleType,
} = require('../src/lib/driverCapabilities')
const {
  normalizeTransportType,
  normalizeTransportPlateKey,
} = require('../src/lib/transportTypes')

test('normalizeTransportType maps aliases and accents to catalog values', () => {
  assert.equal(normalizeTransportType('camioGran'), 'camioGran')
  assert.equal(normalizeTransportType('Camió Gran'), 'camioGran')
  assert.equal(normalizeTransportType('camio gran fred'), 'camioGranFred')
  assert.equal(normalizeTransportType('furgoneta'), 'furgonetaMitjana')
  assert.equal(normalizeTransportType('camiopetit'), 'transport')
  assert.equal(normalizeTransportType(''), '')
  assert.equal(normalizeTransportType('customType'), 'customType')
})

test('normalizeTransportPlateKey strips separators and uppercases', () => {
  assert.equal(normalizeTransportPlateKey(' 1234-abc '), '1234ABC')
  assert.equal(normalizeTransportPlateKey('b-12 34-xy'), 'B1234XY')
  assert.equal(normalizeTransportPlateKey(null), '')
})

test('requiresBigTruckLicense only for camioGran variants', () => {
  assert.equal(requiresBigTruckLicense('camioGran'), true)
  assert.equal(requiresBigTruckLicense('Camió Gran Fred'), true)
  assert.equal(requiresBigTruckLicense('camioPPlataforma'), false)
  assert.equal(requiresBigTruckLicense('furgonetaGran'), false)
  assert.equal(requiresBigTruckLicense(undefined), false)
})

test('canDriverHandleVehicleType enforces big-truck gate and generic driver fallback', () => {
  assert.equal(canDriverHandleVehicleType(null, 'comercial'), false)
  assert.equal(canDriverHandleVehicleType({ isDriver: true }, undefined), true)
  assert.equal(canDriverHandleVehicleType({ camioPetit: true }, 'camioGran'), false)
  assert.equal(canDriverHandleVehicleType({ camioPetit: true }, 'camioGranFred'), false)
  assert.equal(canDriverHandleVehicleType({ camioPetit: true }, 'furgonetaGran'), true)
  assert.equal(canDriverHandleVehicleType({ isDriver: true }, 'camioPPlataformaFred'), true)
  assert.equal(canDriverHandleVehicleType({ isDriver: true }, 'camioGran'), false)
  assert.equal(canDriverHandleVehicleType({ camioGran: true }, 'camioGranFred'), true)
  assert.equal(canDriverHandleVehicleType({ camioGran: true }, 'comercial'), true)
  assert.equal(canDriverHandleVehicleType({}, 'comercial'), false)
})
