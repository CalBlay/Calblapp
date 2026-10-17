const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, afterEach, test } = require('node:test')

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (isFirebaseAdminModule(request)) {
    return { firestoreAdmin: { collection: () => ({}), doc: () => ({}) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const {
  DEFAULT_DEPARTURE_CAL_BLAY,
  emptyDepartmentBlock,
  emptyDepartments,
  mergeDeparturePoint,
} = require('../src/lib/costServeis/defaults')
const { monthsInRange } = require('../src/lib/costServeis/peSeed')
const { normalizeClockTime } = require('../src/lib/costServeis/quadrantPeople')
const { applyQuadrantStaffing } = require('../src/lib/costServeis/quadrantPeople')
const {
  applyKmToSheetDepartments,
  normalizeEventLocationForMaps,
} = require('../src/lib/costServeis/applyDepartureKm')
const {
  distanceCacheDocId,
  normalizeDistanceCacheKey,
} = require('../src/lib/costServeis/distanceCache')
const { getOpsiaFinanceConfig } = require('../src/lib/costServeis/opsiaFinance')

const ENV_KEYS = [
  'OPSIA_FINANCE_BASE_URL',
  'OPSIA_FINANCE_API_KEY',
  'OPSIA_EXTERNAL_API_KEY',
]
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

function sheet(overrides = {}) {
  return {
    eventId: 'ev1',
    eventName: 'Casament',
    eventDate: '2026-09-12',
    ln: 'Casaments',
    location: 'Can Blay (CCH00001)',
    serviceType: 'Banquet',
    numPax: 80,
    billing: 10000,
    departments: emptyDepartments(),
    fixedSalaryAllocated: 0,
    operationalTotal: 0,
    total: 0,
    pctOfBilling: null,
    ...overrides,
  }
}

test('mergeDeparturePoint keeps default address/label when saved values are blank', () => {
  const merged = mergeDeparturePoint(DEFAULT_DEPARTURE_CAL_BLAY, {
    address: '   ',
    label: '',
    lat: null,
    lng: undefined,
  })
  assert.equal(merged.address, DEFAULT_DEPARTURE_CAL_BLAY.address)
  assert.equal(merged.label, DEFAULT_DEPARTURE_CAL_BLAY.label)
  assert.equal(merged.lat, DEFAULT_DEPARTURE_CAL_BLAY.lat)
  assert.equal(merged.lng, DEFAULT_DEPARTURE_CAL_BLAY.lng)
})

test('mergeDeparturePoint keeps a deliberate saved origin including lat 0', () => {
  const merged = mergeDeparturePoint(DEFAULT_DEPARTURE_CAL_BLAY, {
    label: 'Nau nova',
    address: 'Carrer Nou 1, Vilafranca',
    lat: 0,
    lng: 1.5,
  })
  assert.equal(merged.label, 'Nau nova')
  assert.equal(merged.address, 'Carrer Nou 1, Vilafranca')
  assert.equal(merged.lat, 0)
  assert.equal(merged.lng, 1.5)
})

test('monthsInRange includes year wrap and rejects inverted or invalid months', () => {
  assert.deepEqual(monthsInRange('2026-11-01', '2027-02-10'), [
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
  ])
  assert.deepEqual(monthsInRange('2026-01-15', '2026-01-20'), ['2026-01'])
  assert.deepEqual(monthsInRange('2026-03-01', '2026-01-01'), [])
  assert.deepEqual(monthsInRange('', '2026-01-01'), [])
  assert.deepEqual(monthsInRange('nope', '2026-01-01'), [])
})

test('normalizeClockTime accepts Zoho-style clocks and rejects invalid ones', () => {
  assert.equal(normalizeClockTime('9:30'), '09:30')
  assert.equal(normalizeClockTime('9.30'), '09:30')
  assert.equal(normalizeClockTime('9h30'), '09:30')
  assert.equal(normalizeClockTime('09:30:00'), '09:30')
  assert.equal(normalizeClockTime('2026-09-12T09:30:00'), '09:30')
  assert.equal(normalizeClockTime('25:00'), '')
  assert.equal(normalizeClockTime('08:60'), '')
  assert.equal(normalizeClockTime('not-a-time'), '')
  assert.equal(normalizeClockTime(null), '')
  assert.equal(normalizeClockTime(0.375), '')
})

test('location helpers strip codes/slashes and fold accents for distance cache keys', () => {
  assert.equal(
    normalizeEventLocationForMaps('Can Blay (CCH00001) / Sala 2'),
    'Can Blay Sala 2'
  )
  assert.equal(normalizeEventLocationForMaps('Mas | Jardí'), 'Mas Jardí')
  assert.equal(normalizeEventLocationForMaps(''), '')
  assert.equal(
    normalizeDistanceCacheKey('Sant Sadurní (foo) | Orígens'),
    'sant sadurni origens'
  )
  assert.equal(
    distanceCacheDocId('cal blay', 'can blay'),
    distanceCacheDocId('cal blay', 'can blay')
  )
  assert.notEqual(
    distanceCacheDocId('cal blay', 'can blay'),
    distanceCacheDocId('origens', 'can blay')
  )
})

test('applyKmToSheetDepartments does not invent a trip when the quadrant has no vehicles', () => {
  const result = applyKmToSheetDepartments(sheet(), {
    logistica: { kmOutbound: 20, kmReturn: 20, kmTotal: 40 },
  })
  assert.deepEqual(result.departments.logistica.vehicleTrips, [])
})

test('applyKmToSheetDepartments fills empty trips from quadrant vehicle count and keeps manual km', () => {
  const filled = applyKmToSheetDepartments(
    sheet(),
    { logistica: { kmOutbound: 12, kmReturn: 13, kmTotal: 25 } },
    { vehicleCountByDept: { logistica: 2 }, vehicleTypesByDept: { logistica: ['furgonetaGran'] } }
  )
  assert.equal(filled.departments.logistica.vehicleTrips.length, 2)
  assert.equal(filled.departments.logistica.vehicleTrips[0].kmTotal, 25)
  assert.equal(filled.departments.logistica.vehicleTrips[1].vehicleType, 'furgonetaGran')

  const existing = sheet({
    departments: {
      ...emptyDepartments(),
      logistica: {
        ...emptyDepartmentBlock(),
        vehicleTrips: [
          {
            id: 'keep',
            vehicleType: 'camioGran',
            kmOutbound: 8,
            kmReturn: 8,
            kmTotal: 16,
          },
        ],
      },
    },
  })
  const kept = applyKmToSheetDepartments(existing, {
    logistica: { kmOutbound: 40, kmReturn: 40, kmTotal: 80 },
  })
  assert.equal(kept.departments.logistica.vehicleTrips.length, 1)
  assert.equal(kept.departments.logistica.vehicleTrips[0].id, 'keep')
  assert.equal(kept.departments.logistica.vehicleTrips[0].kmTotal, 16)
})

test('applyQuadrantStaffing copies people and hours and clears hoursManual', () => {
  const base = sheet({
    departments: {
      ...emptyDepartments(),
      serveis: { ...emptyDepartmentBlock(), peopleCount: 1, hours: 2, hoursManual: true },
    },
  })
  const result = applyQuadrantStaffing(base, {
    logistica: {
      peopleCount: 3,
      callTime: '08:00',
      closeTime: '16:00',
      hours: 8,
      vehicleCount: 1,
      vehicleTypes: ['camioGran'],
    },
    serveis: {
      peopleCount: 5,
      callTime: '09:00',
      closeTime: '18:00',
      hours: 9,
      vehicleCount: 0,
      vehicleTypes: [],
    },
    cuina: {
      peopleCount: 0,
      callTime: '',
      closeTime: '',
      hours: 0,
      vehicleCount: 0,
      vehicleTypes: [],
    },
  })
  assert.equal(result.departments.logistica.peopleCount, 3)
  assert.equal(result.departments.logistica.callTime, '08:00')
  assert.equal(result.departments.serveis.peopleCount, 5)
  assert.equal(result.departments.serveis.hours, 9)
  assert.equal(result.departments.serveis.hoursManual, false)
})

test('getOpsiaFinanceConfig strips trailing slashes and accepts the legacy API key name', () => {
  delete process.env.OPSIA_FINANCE_API_KEY
  process.env.OPSIA_FINANCE_BASE_URL = 'https://opsia.example.com/'
  process.env.OPSIA_EXTERNAL_API_KEY = 'legacy-key'
  const cfg = getOpsiaFinanceConfig()
  assert.equal(cfg.configured, true)
  assert.equal(cfg.baseUrl, 'https://opsia.example.com')
  assert.equal(cfg.apiKey, 'legacy-key')

  delete process.env.OPSIA_FINANCE_BASE_URL
  delete process.env.OPSIA_EXTERNAL_API_KEY
  const missing = getOpsiaFinanceConfig()
  assert.equal(missing.configured, false)
  assert.equal(missing.apiKey, '')
})
