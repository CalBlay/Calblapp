const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildMaintenanceTemplateSitePayload,
  formatMaintenanceTemplateSite,
  normalizeMaintenanceTemplateSite,
} = require('../src/lib/maintenanceTemplateSite')

test('normalizeMaintenanceTemplateSite keeps location when center or zone is present', () => {
  assert.deepEqual(
    normalizeMaintenanceTemplateSite({
      center: '  Can Blay  ',
      location: '  Cuina  ',
      zone: '  Freda  ',
    }),
    { center: 'Can Blay', location: 'Cuina', zone: 'Freda' }
  )

  assert.deepEqual(
    normalizeMaintenanceTemplateSite({
      center: 'Can Blay',
      location: 'Cuina',
    }),
    { center: 'Can Blay', location: 'Cuina', zone: '' }
  )

  assert.deepEqual(
    normalizeMaintenanceTemplateSite({
      location: 'should-not-become-zone',
      zone: '',
    }),
    { center: '', location: 'should-not-become-zone', zone: '' }
  )
})

test('normalizeMaintenanceTemplateSite treats legacy location-only docs as zone', () => {
  assert.deepEqual(normalizeMaintenanceTemplateSite({ location: '  Exterior  ' }), {
    center: '',
    location: '',
    zone: 'Exterior',
  })
  assert.deepEqual(normalizeMaintenanceTemplateSite(null), {
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

test('build and format maintenance template site trim empty segments', () => {
  assert.deepEqual(
    buildMaintenanceTemplateSitePayload({
      center: ' Can Blay ',
      location: ' ',
      zone: 'Freda',
    }),
    { center: 'Can Blay', location: '', zone: 'Freda' }
  )
  assert.equal(
    formatMaintenanceTemplateSite({ center: 'Can Blay', location: '', zone: 'Freda' }),
    'Can Blay / Freda'
  )
  assert.equal(formatMaintenanceTemplateSite({}), '')
})
