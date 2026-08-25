const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  filterSuppliersByDepartment,
  normalizeSupplierDepartmentsInput,
  serializeSupplier,
  supplierServesDepartment,
} = require('../src/lib/companySuppliers/server')

test('serializeSupplier treats missing departments as Manteniment and active unless explicitly false', () => {
  const legacy = serializeSupplier('s1', { name: ' Acme ', email: 'a@x.com' })
  assert.equal(legacy.id, 's1')
  assert.equal(legacy.name, 'Acme')
  assert.equal(legacy.active, true)
  assert.deepEqual(legacy.supplierDepartments, ['Manteniment'])

  const invalidOnly = serializeSupplier('s2', {
    name: 'Beta',
    active: false,
    supplierDepartments: ['Cuina', '', 'Recursos Humans'],
  })
  assert.equal(invalidOnly.active, false)
  assert.deepEqual(invalidOnly.supplierDepartments, ['Recursos Humans'])

  const emptyAllowed = serializeSupplier('s3', { name: 'Gamma', supplierDepartments: [] })
  assert.deepEqual(emptyAllowed.supplierDepartments, ['Manteniment'])
})

test('filterSuppliersByDepartment keeps only rows that serve the requested scope', () => {
  const rows = [
    serializeSupplier('m', { name: 'M', supplierDepartments: ['Manteniment'] }),
    serializeSupplier('h', { name: 'H', supplierDepartments: ['Recursos Humans'] }),
    serializeSupplier('both', {
      name: 'Both',
      supplierDepartments: ['Manteniment', 'Recursos Humans'],
    }),
  ]

  const maintenance = filterSuppliersByDepartment(rows, 'Manteniment')
  assert.deepEqual(
    maintenance.map((row) => row.id),
    ['m', 'both']
  )
  assert.equal(supplierServesDepartment(rows[1], 'Manteniment'), false)
})

test('normalizeSupplierDepartmentsInput falls back to the caller default, not always Manteniment', () => {
  assert.deepEqual(normalizeSupplierDepartmentsInput(null, ['Recursos Humans']), [
    'Recursos Humans',
  ])
  assert.deepEqual(normalizeSupplierDepartmentsInput(['Cuina', 'Manteniment'], ['Recursos Humans']), [
    'Manteniment',
  ])
  assert.deepEqual(
    normalizeSupplierDepartmentsInput(['Cuina'], ['Recursos Humans']),
    ['Recursos Humans']
  )
})
