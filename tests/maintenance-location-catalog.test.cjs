const assert = require('node:assert/strict')
const { test } = require('node:test')

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const {
  sanitizeMaintenanceZones,
  sanitizeMaintenanceInternalLocations,
  sanitizeMaintenanceLocationNodes,
  buildMaintenanceCenterHierarchy,
  resolveMaintenanceSite,
  maintenanceTicketSiteValues,
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

test('maintenanceTicketSiteValues prefers zone, then workLocation, then center, then location', () => {
  assert.deepEqual(
    maintenanceTicketSiteValues({
      zone: ' Cambra freda ',
      workLocation: '',
      center: 'Cuina Central',
      location: 'legacy loc',
    }),
    ['Cambra freda', 'Cuina Central', 'legacy loc']
  )
  assert.deepEqual(
    maintenanceTicketSiteValues({
      zone: null,
      workLocation: '  ',
      center: undefined,
      location: null,
    }),
    []
  )
})

test('informes site filters match new tickets that only store center/zone, not location', () => {
  const centerOnly = maintenanceTicketSiteValues({
    center: 'Cuina Central',
    location: '',
  })
  assert.equal(
    matchesMaintenanceSiteFilters(centers, { center: 'Cuina Central' }, ...centerOnly),
    true
  )
  assert.equal(
    matchesMaintenanceSiteFilters(centers, { center: 'Cuina Central' }, ''),
    false
  )

  const splitFields = maintenanceTicketSiteValues({
    zone: 'Cambra freda',
    workLocation: 'Planta baixa',
    center: 'Cuina Central',
    location: 'Sala gran',
  })
  assert.equal(
    matchesMaintenanceSiteFilters(
      centers,
      { center: 'Cuina Central', location: 'Planta baixa', zone: 'Cambra freda' },
      ...splitFields
    ),
    true
  )
  assert.equal(
    matchesMaintenanceSiteFilters(centers, { center: 'Finca Nord' }, ...splitFields),
    false
  )
})

test('maintenance informes overview spreads ticket siteValues into the site matcher', () => {
  const source = readFileSync(
    join(__dirname, '../src/lib/informes/buildMaintenanceOverview.ts'),
    'utf8'
  )
  assert.match(source, /siteValues: maintenanceTicketSiteValues\(data\)/)
  assert.match(source, /\.\.\.item\.siteValues/)
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
