const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')

const {
  hoursBetween,
  fuelCostForTrip,
  recomputeVehicleTrip,
  fuelCostForDepartment,
  recomputeDepartmentBlock,
  recomputeSheet,
  summarizeDepartmentBlock,
} = require('../src/lib/costServeis/calc')
const {
  emptyDepartmentBlock,
  emptyDepartments,
  normalizeDepartmentBlock,
  normalizeFuelConfig,
  newVehicleTripLine,
} = require('../src/lib/costServeis/defaults')
const {
  metricsFromParts,
  summarizeResultats,
  groupByServiceType,
  groupByLocation,
  groupByMonth,
  toResultatsItemRow,
} = require('../src/lib/costServeis/resultatsAggregate')
const {
  matchServeiCatalogId,
  normalizeServeiCostWeights,
  DEFAULT_SERVEI_COST_WEIGHTS,
} = require('../src/lib/serveis/utils')
const { placeToMapsQuery, resolveGoogleMapsApiKey } = require('../src/lib/costServeis/googleMapsDistance')

const MAPS_ENV = ['GOOGLE_MAPS_API_KEY', 'GOOGLE_API_KEY', 'NEXT_PUBLIC_GOOGLE_API_KEY']
const previousMapsEnv = Object.fromEntries(MAPS_ENV.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const [key, value] of Object.entries(previousMapsEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const rates = { logistica: 10, serveis: 20, cuina: 30 }
const fuel = {
  roundTripDefault: true,
  byVehicleType: {
    camioGran: { litersPer100km: 10, pricePerLiter: 2 },
    comercial: { litersPer100km: 5, pricePerLiter: 1 },
  },
}

function sheet(overrides = {}) {
  return {
    eventId: 'e1',
    eventName: 'Casament',
    eventDate: '2026-09-08',
    ln: 'LN1',
    location: 'Finca',
    serviceType: 'Catering',
    numPax: 80,
    billing: 1000,
    departments: emptyDepartments(),
    fixedSalaryAllocated: 0,
    operationalTotal: 0,
    total: 0,
    pctOfBilling: null,
    ...overrides,
  }
}

function listItem(overrides = {}) {
  return {
    eventId: 'e1',
    eventName: 'Casament',
    eventDate: '2026-09-08',
    ln: 'LN1',
    location: 'Finca A',
    serviceType: 'Catering',
    serviceInCatalog: true,
    billing: 100,
    numPax: 10,
    hasSheet: true,
    operationalTotal: 40,
    total: 40,
    pctOfBilling: 0.4,
    byDepartment: { logistica: 20, serveis: 10, cuina: 10 },
    detailByDepartment: {},
    ...overrides,
  }
}

test('hoursBetween supports overnight wrap and rejects invalid clocks', () => {
  assert.equal(hoursBetween('08:00', '13:00'), 5)
  assert.equal(hoursBetween('9:30', '10:30'), 1)
  assert.equal(hoursBetween('22:00', '06:00'), 8)
  assert.equal(hoursBetween('08:00', '08:00'), 0)
  assert.equal(hoursBetween('08:00', '08:01'), 0.02)
  assert.equal(hoursBetween('', '10:00'), 0)
  assert.equal(hoursBetween('25:00', '10:00'), 0)
  assert.equal(hoursBetween('08:60', '10:00'), 0)
  assert.equal(hoursBetween('not-a-time', '10:00'), 0)
})

test('fuelCostForTrip is zero for non-positive km and rounds to cents', () => {
  assert.equal(fuelCostForTrip(100, 10, 2), 20)
  assert.equal(fuelCostForTrip(0, 10, 2), 0)
  assert.equal(fuelCostForTrip(-5, 10, 2), 0)
  assert.equal(fuelCostForTrip(33, 12, 1.47), 5.82)
})

test('recomputeVehicleTrip copies outbound km when round-trip default is on', () => {
  const copied = recomputeVehicleTrip(
    newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 12, kmReturn: 0 }),
    fuel
  )
  assert.equal(copied.kmReturn, 12)
  assert.equal(copied.kmTotal, 24)

  const kept = recomputeVehicleTrip(
    newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 12, kmReturn: 8 }),
    fuel
  )
  assert.equal(kept.kmReturn, 8)
  assert.equal(kept.kmTotal, 20)

  const oneWay = recomputeVehicleTrip(
    newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 12, kmReturn: 0 }),
    { ...fuel, roundTripDefault: false }
  )
  assert.equal(oneWay.kmReturn, 0)
  assert.equal(oneWay.kmTotal, 12)
})

test('recomputeDepartmentBlock uses call/close hours unless hours are marked manual', () => {
  const autoHours = recomputeDepartmentBlock(
    {
      ...emptyDepartmentBlock(),
      callTime: '08:00',
      closeTime: '12:00',
      peopleCount: 2,
      extras: 5,
    },
    'logistica',
    rates,
    { ...fuel, roundTripDefault: false }
  )
  assert.equal(autoHours.hours, 4)
  assert.equal(autoHours.subtotal, 85)

  const manual = recomputeDepartmentBlock(
    {
      ...emptyDepartmentBlock(),
      callTime: '08:00',
      closeTime: '12:00',
      hours: 1.5,
      hoursManual: true,
      peopleCount: 2,
    },
    'logistica',
    rates,
    fuel
  )
  assert.equal(manual.hours, 1.5)
  assert.equal(manual.subtotal, 30)
})

test('recomputeDepartmentBlock clamps negative extras and uses per-vehicle fuel rates', () => {
  const block = recomputeDepartmentBlock(
    {
      ...emptyDepartmentBlock(),
      hours: 1,
      hoursManual: true,
      peopleCount: 1,
      extras: -20,
      vehicleTrips: [
        newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 50, kmReturn: 50, kmTotal: 100 }),
        newVehicleTripLine({ vehicleType: 'comercial', kmOutbound: 20, kmReturn: 20, kmTotal: 40 }),
      ],
    },
    'logistica',
    rates,
    { ...fuel, roundTripDefault: false }
  )
  assert.equal(fuelCostForDepartment(block, fuel), 22)
  assert.equal(block.subtotal, 32)
})

test('recomputeSheet totals departments plus fixed salary and hides pct without billing', () => {
  const departments = emptyDepartments()
  departments.logistica = {
    ...emptyDepartmentBlock(),
    hours: 2,
    hoursManual: true,
    peopleCount: 1,
  }
  departments.cuina = {
    ...emptyDepartmentBlock(),
    hours: 1,
    hoursManual: true,
    peopleCount: 1,
    extras: 10,
  }

  const billed = recomputeSheet(
    sheet({ departments, billing: 1000, fixedSalaryAllocated: 15 }),
    rates,
    fuel
  )
  assert.equal(billed.departments.logistica.subtotal, 20)
  assert.equal(billed.departments.cuina.subtotal, 40)
  assert.equal(billed.operationalTotal, 60)
  assert.equal(billed.total, 75)
  assert.equal(billed.pctOfBilling, 0.075)

  const unbilled = recomputeSheet(sheet({ departments, billing: 0 }), rates, fuel)
  assert.equal(unbilled.pctOfBilling, null)
})

test('summarizeDepartmentBlock groups vehicle km by type', () => {
  const summary = summarizeDepartmentBlock(
    {
      ...emptyDepartmentBlock(),
      hours: 2,
      hoursManual: true,
      peopleCount: 3,
      vehicleTrips: [
        newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 10, kmReturn: 10, kmTotal: 20 }),
        newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 5, kmReturn: 5, kmTotal: 10 }),
        newVehicleTripLine({ vehicleType: 'comercial', kmOutbound: 4, kmReturn: 0, kmTotal: 4 }),
      ],
    },
    'logistica',
    rates,
    { ...fuel, roundTripDefault: false }
  )
  assert.equal(summary.personHours, 6)
  assert.equal(summary.laborCost, 60)
  assert.equal(summary.kmTotal, 34)
  assert.equal(summary.vehicleCount, 3)
  assert.deepEqual(
    summary.vehicles.map((row) => ({ vehicleType: row.vehicleType, lines: row.lines, km: row.km })),
    [
      { vehicleType: 'camioGran', lines: 2, km: 30 },
      { vehicleType: 'comercial', lines: 1, km: 4 },
    ]
  )
})

test('normalizeFuelConfig migrates legacy global L/100 and keeps roundTripDefault', () => {
  const migrated = normalizeFuelConfig({ litersPer100km: 18, pricePerLiter: 1.5, roundTripDefault: false })
  assert.equal(migrated.roundTripDefault, false)
  assert.equal(migrated.byVehicleType.camioGran.litersPer100km, 18)
  assert.equal(migrated.byVehicleType.comercial.pricePerLiter, 1.5)

  const patched = normalizeFuelConfig({
    byVehicleType: { camioGran: { litersPer100km: 9, pricePerLiter: 1.1 } },
  })
  assert.equal(patched.roundTripDefault, true)
  assert.equal(patched.byVehicleType.camioGran.litersPer100km, 9)
  assert.equal(patched.byVehicleType.comercial.litersPer100km, 7)

  const fallback = normalizeFuelConfig(null)
  assert.equal(fallback.roundTripDefault, true)
  assert.equal(fallback.byVehicleType.camioGran.pricePerLiter, 1.47)
})

test('normalizeDepartmentBlock lifts legacy km fields into a vehicle trip', () => {
  const lifted = normalizeDepartmentBlock({
    callTime: '08:00',
    kmOutbound: 11,
    kmReturn: 9,
    vehicleType: 'comercial',
  })
  assert.equal(lifted.callTime, '08:00')
  assert.equal(lifted.vehicleTrips.length, 1)
  assert.equal(lifted.vehicleTrips[0].vehicleType, 'comercial')
  assert.equal(lifted.vehicleTrips[0].kmOutbound, 11)
  assert.equal(lifted.vehicleTrips[0].kmReturn, 9)
  assert.equal(lifted.vehicleTrips[0].kmTotal, 20)

  const empty = normalizeDepartmentBlock({ kmOutbound: 0, kmReturn: 0 })
  assert.deepEqual(empty.vehicleTrips, [])
  assert.deepEqual(normalizeDepartmentBlock(null).vehicleTrips, [])
})

test('matchServeiCatalogId matches slugified name, code, or id and ignores blanks', () => {
  const catalog = [
    { id: 'cat-01', nom: 'Càtering Extra', codi: 'catering-extra' },
    { id: 'bodas', nom: 'Bodes', codi: 'bodes' },
  ]
  assert.equal(matchServeiCatalogId('Càtering Extra', catalog), 'cat-01')
  assert.equal(matchServeiCatalogId('catering-extra', catalog), 'cat-01')
  assert.equal(matchServeiCatalogId('cat-01', catalog), 'cat-01')
  assert.equal(matchServeiCatalogId('  Bodes  ', catalog), 'bodas')
  assert.equal(matchServeiCatalogId('', catalog), null)
  assert.equal(matchServeiCatalogId('desconegut', catalog), null)
})

test('normalizeServeiCostWeights rejects negatives and rounds to thousandths', () => {
  assert.deepEqual(normalizeServeiCostWeights(null), DEFAULT_SERVEI_COST_WEIGHTS)
  assert.deepEqual(normalizeServeiCostWeights({ gestio: -1, preparacio: 'nope', rentat: 2.3456 }), {
    gestio: 1,
    preparacio: 1,
    rentat: 2.346,
  })
  assert.deepEqual(normalizeServeiCostWeights({ gestio: 0, preparacio: 0, rentat: 0 }), {
    gestio: 0,
    preparacio: 0,
    rentat: 0,
  })
})

test('resultats metrics treat missing billing/pax as null ratios and group empty labels', () => {
  const zeroBilling = metricsFromParts({ eventCount: 1, numPax: 0, billing: 0, cost: 40 })
  assert.equal(zeroBilling.margin, -40)
  assert.equal(zeroBilling.marginPct, null)
  assert.equal(zeroBilling.costPct, null)
  assert.equal(zeroBilling.costPerPax, null)
  assert.equal(zeroBilling.billingPerPax, null)

  const items = [
    listItem({ eventId: 'a', serviceType: 'Catering', location: '', eventDate: '2026-09-01', billing: 200, total: 50, numPax: 10 }),
    listItem({ eventId: 'b', serviceType: '', location: 'Finca A', eventDate: '2026-08-15', billing: 100, total: 80, numPax: 5 }),
  ]
  const summary = summarizeResultats(items)
  assert.equal(summary.eventCount, 2)
  assert.equal(summary.billing, 300)
  assert.equal(summary.cost, 130)
  assert.equal(summary.margin, 170)
  assert.equal(summary.marginPct, 0.5667)

  const byType = groupByServiceType(items)
  assert.equal(byType[0].label, 'Catering')
  assert.equal(byType[1].label, 'Sense tipus')
  assert.equal(groupByLocation(items).find((row) => row.key === '__sense__').label, 'Sense ubicació')
  assert.deepEqual(
    groupByMonth(items).map((row) => row.key),
    ['2026-09', '2026-08']
  )
  assert.equal(toResultatsItemRow(items[0]).ym, '2026-09')
})

test('placeToMapsQuery prefers coordinates and resolveGoogleMapsApiKey follows env order', () => {
  assert.equal(placeToMapsQuery('  Carrer Major 1  '), 'Carrer Major 1')
  assert.equal(
    placeToMapsQuery({ lat: 41.4, lng: 1.7, address: 'ignored' }),
    '41.4,1.7'
  )
  assert.equal(
    placeToMapsQuery({ address: '  Molí 11  ', label: 'Cal Blay' }),
    'Molí 11'
  )
  assert.equal(placeToMapsQuery({ label: 'Cal Blay' }), 'Cal Blay')

  delete process.env.GOOGLE_MAPS_API_KEY
  delete process.env.GOOGLE_API_KEY
  delete process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  assert.equal(resolveGoogleMapsApiKey(), '')

  process.env.NEXT_PUBLIC_GOOGLE_API_KEY = ' public '
  assert.equal(resolveGoogleMapsApiKey(), 'public')
  process.env.GOOGLE_API_KEY = ' secondary '
  assert.equal(resolveGoogleMapsApiKey(), 'secondary')
  process.env.GOOGLE_MAPS_API_KEY = ' primary '
  assert.equal(resolveGoogleMapsApiKey(), 'primary')
})
