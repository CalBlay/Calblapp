const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeMaintenanceTemplateSite,
  buildMaintenanceTemplateSitePayload,
  formatMaintenanceTemplateSite,
} = require('../src/lib/maintenanceTemplateSite')

test('normalizeMaintenanceTemplateSite keeps explicit center/location/zone fields', () => {
  assert.deepEqual(
    normalizeMaintenanceTemplateSite({
      center: ' Cuina Central ',
      location: ' Planta baixa ',
      zone: ' Rebost ',
    }),
    {
      center: 'Cuina Central',
      location: 'Planta baixa',
      zone: 'Rebost',
    }
  )
})

test('normalizeMaintenanceTemplateSite migrates legacy location-only values into zone', () => {
  assert.deepEqual(normalizeMaintenanceTemplateSite({ location: 'Rebost antic' }), {
    center: '',
    location: '',
    zone: 'Rebost antic',
  })
})

test('normalizeMaintenanceTemplateSite treats explicit empty zone as modern shape', () => {
  assert.deepEqual(
    normalizeMaintenanceTemplateSite({
      center: '',
      location: 'Planta baixa',
      zone: '',
    }),
    {
      center: '',
      location: 'Planta baixa',
      zone: '',
    }
  )
})

test('normalizeMaintenanceTemplateSite tolerates nullish and non-object input', () => {
  assert.deepEqual(normalizeMaintenanceTemplateSite(null), {
    center: '',
    location: '',
    zone: '',
  })
  assert.deepEqual(normalizeMaintenanceTemplateSite(undefined), {
    center: '',
    location: '',
    zone: '',
  })
  assert.deepEqual(normalizeMaintenanceTemplateSite('legacy'), {
    center: '',
    location: '',
    zone: '',
  })
})

test('buildMaintenanceTemplateSitePayload and formatMaintenanceTemplateSite clean values', () => {
  assert.deepEqual(
    buildMaintenanceTemplateSitePayload({
      center: ' Cuina ',
      location: ' Planta ',
      zone: ' Zone ',
    }),
    {
      center: 'Cuina',
      location: 'Planta',
      zone: 'Zone',
    }
  )
  assert.equal(
    formatMaintenanceTemplateSite({
      center: 'Cuina',
      location: '',
      zone: 'Rebost',
    }),
    'Cuina / Rebost'
  )
})
