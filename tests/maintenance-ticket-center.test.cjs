const assert = require('node:assert/strict')
const { test } = require('node:test')

const { resolveMaintenanceTicketCenter } = require('../src/lib/maintenanceLocationCatalog')

const centers = [
  {
    id: 'c1',
    name: 'Cuina Central',
    code: 'CC',
    tipus: 'propi',
    locationNodes: [
      { name: 'Planta baixa', zones: ['Rebost', 'Cambra freda'] },
      { name: 'Terrassa', zones: ['Barra'] },
    ],
  },
  {
    id: 'c2',
    name: 'Finca Nord',
    code: 'FN',
    tipus: 'extern',
    locationNodes: [{ name: 'Sala gran', zones: ['Escenari'] }],
  },
]

test('keeps an explicit ticket.center even when it is not in the hierarchy', () => {
  assert.equal(
    resolveMaintenanceTicketCenter(centers, {
      center: '  Centre Custom  ',
      workLocation: 'Planta baixa',
      location: 'Cuina Central',
    }),
    'Centre Custom'
  )
})

test('infers center from workLocation then location when center is empty', () => {
  assert.equal(
    resolveMaintenanceTicketCenter(centers, {
      center: '',
      workLocation: 'Cambra freda',
      location: 'Finca Nord',
    }),
    'Cuina Central'
  )
  assert.equal(
    resolveMaintenanceTicketCenter(centers, {
      center: null,
      workLocation: null,
      location: 'FN',
    }),
    'Finca Nord'
  )
  assert.equal(
    resolveMaintenanceTicketCenter(centers, {
      center: '   ',
      workLocation: 'sala gran',
      location: '',
    }),
    'Finca Nord'
  )
})

test('returns empty string when nothing resolves to a center', () => {
  assert.equal(
    resolveMaintenanceTicketCenter(centers, {
      center: null,
      workLocation: 'desconegut',
      location: '',
    }),
    ''
  )
})
