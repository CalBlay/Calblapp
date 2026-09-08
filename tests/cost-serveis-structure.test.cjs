const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, afterEach, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  resolveStructurePots,
  allocateStructurePotsToEvents,
  applyStructureQuotasToSheet,
} = require('../src/lib/costServeis/allocateStructure')
const { flattenOpsiaMonthsToRows, getOpsiaFinanceConfig } = require('../src/lib/costServeis/opsiaFinance')
const { isPonderacioDept, serveiWeightDocId } = require('../src/lib/costServeis/serveiWeights')
const {
  normalizeDistanceCacheKey,
  distanceCacheDocId,
} = require('../src/lib/costServeis/distanceCache')
const {
  normalizeEventLocationForMaps,
  applyKmToSheetDepartments,
} = require('../src/lib/costServeis/applyDepartureKm')
const { normalizeClockTime, applyQuadrantStaffing } = require('../src/lib/costServeis/quadrantPeople')
const { emptyDepartmentBlock, emptyDepartments, newVehicleTripLine } = require('../src/lib/costServeis/defaults')

const OPSIA_ENV = ['OPSIA_FINANCE_BASE_URL', 'OPSIA_FINANCE_API_KEY']
const previousOpsiaEnv = Object.fromEntries(OPSIA_ENV.map((key) => [key, process.env[key]]))

after(() => {
  Module._load = originalLoad
})

afterEach(() => {
  for (const [key, value] of Object.entries(previousOpsiaEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const catalog = [
  { id: 'cat-01', nom: 'Càtering Extra', codi: 'catering-extra' },
  { id: 'bodas', nom: 'Bodes', codi: 'bodes' },
]

const weightRows = [
  {
    id: 'cat-01__logistica',
    serveiId: 'cat-01',
    serveiNom: 'Càtering Extra',
    serveiCodi: 'catering-extra',
    dept: 'logistica',
    gestio: 1,
    preparacio: 1,
    rentat: 1,
    updatedAt: '',
  },
  {
    id: 'cat-01__cuina',
    serveiId: 'cat-01',
    serveiNom: 'Càtering Extra',
    serveiCodi: 'catering-extra',
    dept: 'cuina',
    gestio: 2,
    preparacio: 1,
    rentat: 1,
    updatedAt: '',
  },
]

const rates = { logistica: 10, serveis: 10, cuina: 10 }
const fuel = { roundTripDefault: false, byVehicleType: {} }

function baseSheet() {
  return {
    eventId: 'e1',
    eventName: 'Casament',
    eventDate: '2026-09-08',
    ln: 'LN1',
    location: 'Finca',
    serviceType: 'Catering',
    numPax: 80,
    billing: 0,
    departments: emptyDepartments(),
    fixedSalaryAllocated: 0,
    operationalTotal: 0,
    total: 0,
    pctOfBilling: null,
  }
}

test('resolveStructurePots prefers stored pots and falls back to summing lines', () => {
  assert.equal(resolveStructurePots(null), null)
  assert.equal(
    resolveStructurePots({
      centre: { codi: 'CCC00004', nom: 'LOGISTICA' },
      pots: { gestio: 0, preparacio: 0, rentat: 0 },
      lines: [],
    }),
    null
  )
  assert.deepEqual(
    resolveStructurePots({
      centre: { codi: 'CCC00004', nom: 'LOGISTICA' },
      pots: { gestio: 10, preparacio: 0, rentat: 0 },
      lines: [{ deptCodi: 'X', deptNom: 'X', costPersonal: 99, pot: 'gestio' }],
    }),
    { gestio: 10, preparacio: 0, rentat: 0 }
  )
  assert.deepEqual(
    resolveStructurePots({
      centre: { codi: 'CCC00004', nom: 'LOGISTICA' },
      pots: { gestio: 0, preparacio: 0, rentat: 0 },
      lines: [
        { deptCodi: 'A', deptNom: 'Gestió', costPersonal: 12.345, pot: 'gestio' },
        { deptCodi: 'B', deptNom: 'Prep', costPersonal: 7, pot: 'preparacio' },
        { deptCodi: 'C', deptNom: 'Altres', costPersonal: 40, pot: null },
      ],
    }),
    { gestio: 12.35, preparacio: 7, rentat: 0 }
  )
})

test('allocateStructurePotsToEvents splits gestió by coef and prep/rentat by coef×pax', () => {
  const allocated = allocateStructurePotsToEvents({
    pots: { gestio: 100, preparacio: 100, rentat: 40 },
    events: [
      { eventId: 'small', serviceType: 'Càtering Extra', numPax: 10 },
      { eventId: 'large', serviceType: 'Càtering Extra', numPax: 30 },
    ],
    catalog,
    weightRows,
    dept: 'logistica',
  })
  assert.equal(allocated.get('small').managementCost, 50)
  assert.equal(allocated.get('large').managementCost, 50)
  assert.equal(allocated.get('small').preparationCost, 25)
  assert.equal(allocated.get('large').preparationCost, 75)
  assert.equal(allocated.get('small').washingCost, 10)
  assert.equal(allocated.get('large').washingCost, 30)
})

test('allocateStructurePotsToEvents treats missing pax as 1 and ignores other-dept weights', () => {
  const allocated = allocateStructurePotsToEvents({
    pots: { gestio: 90, preparacio: 0, rentat: 0 },
    events: [
      { eventId: 'known', serviceType: 'Càtering Extra', numPax: 0 },
      { eventId: 'unknown', serviceType: 'Desconegut', numPax: 100 },
    ],
    catalog,
    weightRows,
    dept: 'cuina',
  })
  // known uses cuina gestio=2; unknown falls back to default 1 → 60 / 30
  assert.equal(allocated.get('known').managementCost, 60)
  assert.equal(allocated.get('unknown').managementCost, 30)
  assert.equal(allocated.get('known').preparationCost, 0)
})

test('applyStructureQuotasToSheet writes logística/cuina pots and recomputes subtotals', () => {
  const next = applyStructureQuotasToSheet(
    baseSheet(),
    {
      logistica: { managementCost: 12, preparationCost: 8, washingCost: 4 },
      cuina: { managementCost: 3, preparationCost: 1, washingCost: 2 },
    },
    rates,
    fuel
  )
  assert.equal(next.departments.logistica.managementCost, 12)
  assert.equal(next.departments.logistica.subtotal, 24)
  assert.equal(next.departments.cuina.subtotal, 6)
  assert.equal(next.departments.serveis.managementCost, 0)
  assert.equal(next.operationalTotal, 30)
})

test('isPonderacioDept and serveiWeightDocId are the logística/cuina weight keys', () => {
  assert.equal(isPonderacioDept('logistica'), true)
  assert.equal(isPonderacioDept('cuina'), true)
  assert.equal(isPonderacioDept('serveis'), false)
  assert.equal(isPonderacioDept('Logistica'), false)
  assert.equal(serveiWeightDocId('cat-01', 'cuina'), 'cat-01__cuina')
})

test('flattenOpsiaMonthsToRows filters by CalBlay dept and sorts stably', () => {
  const docs = [
    {
      year: 2026,
      month: 9,
      ym: '2026-09',
      source: 'opsia-finance',
      syncedAt: '2026-09-08T00:00:00.000Z',
      departments: {
        logistica: {
          centre: { codi: 'CCC00004', nom: 'LOGISTICA' },
          pots: { gestio: 1, preparacio: 0, rentat: 0 },
          lines: [
            { deptCodi: 'B', deptNom: 'Beta', costPersonal: 2, pot: 'gestio' },
            { deptCodi: 'A', deptNom: 'Alfa', costPersonal: 1, pot: 'gestio' },
          ],
        },
        cuina: {
          centre: { codi: 'CCC00007', nom: 'CUINA CENTRAL' },
          pots: { gestio: 5, preparacio: 0, rentat: 0 },
          lines: [{ deptCodi: 'C', deptNom: 'Cuina', costPersonal: 5, pot: 'gestio' }],
        },
      },
    },
  ]
  const all = flattenOpsiaMonthsToRows(docs, 'all')
  assert.deepEqual(
    all.map((row) => `${row.calBlayDept}:${row.deptCodi}`),
    ['cuina:C', 'logistica:A', 'logistica:B']
  )
  const onlyCuina = flattenOpsiaMonthsToRows(docs, 'cuina')
  assert.equal(onlyCuina.length, 1)
  assert.equal(onlyCuina[0].deptNom, 'Cuina')
  assert.deepEqual(flattenOpsiaMonthsToRows(docs, 'serveis'), [])
})

test('getOpsiaFinanceConfig requires both env vars and strips a trailing slash', () => {
  delete process.env.OPSIA_FINANCE_BASE_URL
  delete process.env.OPSIA_FINANCE_API_KEY
  assert.equal(getOpsiaFinanceConfig().configured, false)

  process.env.OPSIA_FINANCE_BASE_URL = 'https://opsia.example.test/'
  process.env.OPSIA_FINANCE_API_KEY = '  secret  '
  const cfg = getOpsiaFinanceConfig()
  assert.equal(cfg.configured, true)
  assert.equal(cfg.baseUrl, 'https://opsia.example.test')
  assert.equal(cfg.apiKey, 'secret')
})

test('normalizeEventLocationForMaps and cache keys drop parentheticals and fold accents', () => {
  assert.equal(
    normalizeEventLocationForMaps('  Finca Masia (Sant Pere) | Barcelona  '),
    'Finca Masia Barcelona'
  )
  assert.equal(normalizeEventLocationForMaps(''), '')
  assert.equal(
    normalizeDistanceCacheKey('Cal Blay (Sant Pere) / Sant Sadurní'),
    'cal blay sant sadurni'
  )
  assert.equal(normalizeDistanceCacheKey('  CAL BLAY  '), 'cal blay')
  const a = distanceCacheDocId('cal blay', 'finca masia')
  const b = distanceCacheDocId('cal blay', 'finca masia')
  const c = distanceCacheDocId('finca masia', 'cal blay')
  assert.equal(a, b)
  assert.equal(a.length, 40)
  assert.notEqual(a, c)
})

test('applyKmToSheetDepartments does not invent trips without vehicles and does not overwrite km', () => {
  const km = { logistica: { kmOutbound: 10, kmReturn: 10, kmTotal: 20 } }

  const withoutVehicles = applyKmToSheetDepartments(baseSheet(), km)
  assert.deepEqual(withoutVehicles.departments.logistica.vehicleTrips, [])

  const fromQuadrant = applyKmToSheetDepartments(baseSheet(), km, {
    vehicleCountByDept: { logistica: 2 },
    vehicleTypesByDept: { logistica: ['comercial', 'camioGran'] },
  })
  assert.equal(fromQuadrant.departments.logistica.vehicleTrips.length, 2)
  assert.equal(fromQuadrant.departments.logistica.vehicleTrips[0].vehicleType, 'comercial')
  assert.equal(fromQuadrant.departments.logistica.vehicleTrips[1].vehicleType, 'camioGran')
  assert.equal(fromQuadrant.departments.logistica.vehicleTrips[0].kmTotal, 20)
  assert.equal(fromQuadrant.departments.logistica.vehicleTrips[1].kmTotal, 20)

  const departments = emptyDepartments()
  departments.logistica = {
    ...emptyDepartmentBlock(),
    vehicleTrips: [
      newVehicleTripLine({ vehicleType: 'camioGran', kmOutbound: 3, kmReturn: 3, kmTotal: 6 }),
    ],
  }
  const kept = applyKmToSheetDepartments({ ...baseSheet(), departments }, km, {
    vehicleCountByDept: { logistica: 4 },
  })
  assert.equal(kept.departments.logistica.vehicleTrips.length, 1)
  assert.equal(kept.departments.logistica.vehicleTrips[0].kmTotal, 6)
})

test('normalizeClockTime accepts HH:mm variants and ISO; applyQuadrantStaffing clears manual hours', () => {
  assert.equal(normalizeClockTime('9:30'), '09:30')
  assert.equal(normalizeClockTime('9.30'), '09:30')
  assert.equal(normalizeClockTime('09:30:45'), '09:30')
  assert.equal(normalizeClockTime('2026-09-08T07:15:00'), '07:15')
  assert.equal(normalizeClockTime('24:00'), '')
  assert.equal(normalizeClockTime(0.375), '')
  assert.equal(normalizeClockTime(''), '')

  const departments = emptyDepartments()
  departments.logistica = {
    ...emptyDepartmentBlock(),
    peopleCount: 9,
    hours: 12,
    hoursManual: true,
    callTime: '06:00',
    closeTime: '18:00',
  }
  const next = applyQuadrantStaffing(
    { departments },
    {
      logistica: {
        peopleCount: 4,
        vehicleCount: 1,
        vehicleTypes: ['camioGran'],
        callTime: '08:00',
        closeTime: '14:00',
        hours: 6,
      },
      serveis: {
        peopleCount: 0,
        vehicleCount: 0,
        vehicleTypes: [],
        callTime: '',
        closeTime: '',
        hours: 0,
      },
      cuina: {
        peopleCount: 2,
        vehicleCount: 0,
        vehicleTypes: [],
        callTime: '07:00',
        closeTime: '15:00',
        hours: 8,
      },
    }
  )
  assert.equal(next.departments.logistica.peopleCount, 4)
  assert.equal(next.departments.logistica.callTime, '08:00')
  assert.equal(next.departments.logistica.hours, 6)
  assert.equal(next.departments.logistica.hoursManual, false)
  assert.equal(next.departments.cuina.peopleCount, 2)
})
