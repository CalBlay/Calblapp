const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  sanitizeMaintenanceZones,
  sanitizeMaintenanceInternalLocations,
  sanitizeMaintenanceLocationNodes,
  buildMaintenanceCenterHierarchy,
  resolveMaintenanceSite,
  matchesMaintenanceSiteFilters,
  buildControlledMaintenanceLocations,
  getMaintenanceLocationsForCenter,
  getMaintenanceZones,
  getCenterInternalLocations,
} = require('../src/lib/maintenanceLocationCatalog')

const centers = [
  {
    id: 'c1',
    name: 'Cuina Central',
    code: 'CC',
    tipus: 'propi',
    locationNodes: [
      { name: 'Planta baixa', zones: ['Rebost', 'Cambra freda', 'rebost'] },
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

test('sanitizeMaintenanceZones dedupes accent-insensitive duplicates and sorts', () => {
  assert.deepEqual(sanitizeMaintenanceZones(['Rebost', '  rebost ', 'Cambra', '', null]), [
    'Cambra',
    'Rebost',
  ])
  assert.deepEqual(sanitizeMaintenanceZones('not-an-array'), [])
})

test('sanitizeMaintenanceLocationNodes falls back to flat internal locations', () => {
  assert.deepEqual(
    sanitizeMaintenanceLocationNodes(null, ['Magatzem', 'magatzem', 'Cuina']),
    [
      { name: 'Cuina', zones: [] },
      { name: 'Magatzem', zones: [] },
    ]
  )
})

test('buildMaintenanceCenterHierarchy normalizes nested center/location/zone data', () => {
  const hierarchy = buildMaintenanceCenterHierarchy(centers)
  assert.equal(hierarchy.length, 2)
  assert.equal(hierarchy[0].name, 'Cuina Central')
  assert.deepEqual(
    hierarchy[0].locations.find((row) => row.name === 'Planta baixa')?.zones,
    ['Cambra freda', 'Rebost']
  )
})

test('resolveMaintenanceSite matches center, location, and zone with fuzzy fallback', () => {
  assert.deepEqual(resolveMaintenanceSite(centers, 'CC'), {
    center: 'Cuina Central',
    location: '',
    zone: '',
  })
  assert.deepEqual(resolveMaintenanceSite(centers, 'Planta baixa'), {
    center: 'Cuina Central',
    location: 'Planta baixa',
    zone: '',
  })
  assert.deepEqual(resolveMaintenanceSite(centers, 'Cambra freda'), {
    center: 'Cuina Central',
    location: 'Planta baixa',
    zone: 'Cambra freda',
  })
  assert.deepEqual(resolveMaintenanceSite(centers, 'cuina centr'), {
    center: 'Cuina Central',
    location: '',
    zone: '',
  })
  assert.deepEqual(resolveMaintenanceSite(centers, '', null, 'unknown'), {
    center: '',
    location: '',
    zone: '',
  })
})

test('matchesMaintenanceSiteFilters resolves free-text values against hierarchy filters', () => {
  assert.equal(
    matchesMaintenanceSiteFilters(centers, { center: 'Cuina Central' }, 'Cambra freda'),
    true
  )
  assert.equal(
    matchesMaintenanceSiteFilters(
      centers,
      { center: 'Cuina Central', location: 'Terrassa' },
      'Cambra freda'
    ),
    false
  )
  assert.equal(matchesMaintenanceSiteFilters(centers, {}, 'anything'), true)
})

test('buildControlledMaintenanceLocations includes propi centers and internal locations', () => {
  const rows = [
    {
      id: 'c1',
      name: 'Cuina Central',
      tipus: 'propi',
      locationNodes: [{ name: 'Planta baixa', zones: ['Rebost'] }],
    },
    {
      id: 'c2',
      name: 'Finca Nord',
      tipus: 'extern',
      internalLocations: ['Pati'],
    },
  ]

  assert.deepEqual(buildControlledMaintenanceLocations(rows), [
    'Cuina Central',
    'Pati',
    'Planta baixa',
  ])
})

test('location and zone option helpers filter by selected center/location', () => {
  assert.deepEqual(getMaintenanceLocationsForCenter(centers, 'Cuina Central'), [
    'Planta baixa',
    'Terrassa',
  ])
  assert.deepEqual(getMaintenanceZones(centers, 'Cuina Central', 'Planta baixa'), [
    'Cambra freda',
    'Rebost',
  ])
  assert.deepEqual(getCenterInternalLocations(centers, 'Cuina Central'), [
    'Planta baixa',
    'Terrassa',
  ])
})
