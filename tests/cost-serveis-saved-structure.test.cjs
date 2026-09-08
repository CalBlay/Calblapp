const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')

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
  applyLiveStructureQuotasToListItems,
  hasSavedStructureCosts,
} = require('../src/lib/costServeis/allocateStructure')

const ROOT = path.join(__dirname, '..')

function emptyDetail(overrides = {}) {
  return {
    peopleCount: 0,
    hours: 0,
    personHours: 0,
    extras: 0,
    kmTotal: 0,
    laborCost: 80,
    fuelCost: 20,
    managementCost: 0,
    preparationCost: 0,
    washingCost: 0,
    vehicleCount: 0,
    subtotal: 100,
    vehicles: [],
    ...overrides,
  }
}

function listItem(eventId, detailOverrides = {}) {
  const logistica = emptyDetail(detailOverrides)
  return {
    eventId,
    eventName: eventId,
    eventDate: '2026-09-08',
    ln: '',
    location: '',
    serviceType: 'Casament',
    serviceInCatalog: true,
    billing: 1000,
    numPax: 100,
    hasSheet: Boolean(detailOverrides.managementCost),
    operationalTotal: logistica.subtotal,
    total: logistica.subtotal,
    pctOfBilling: null,
    byDepartment: { logistica: logistica.subtotal, serveis: 0, cuina: 0 },
    detailByDepartment: {
      logistica,
      serveis: emptyDetail({ laborCost: 0, fuelCost: 0, subtotal: 0 }),
      cuina: emptyDetail({ laborCost: 0, fuelCost: 0, subtotal: 0 }),
    },
  }
}

test('hasSavedStructureCosts is true when any Opsia pot on the fitxa is > 0', () => {
  assert.equal(hasSavedStructureCosts(null), false)
  assert.equal(hasSavedStructureCosts({}), false)
  assert.equal(
    hasSavedStructureCosts({ managementCost: 0, preparationCost: 0, washingCost: 0 }),
    false
  )
  assert.equal(hasSavedStructureCosts({ managementCost: 40 }), true)
  assert.equal(hasSavedStructureCosts({ preparationCost: 12 }), true)
  assert.equal(hasSavedStructureCosts({ washingCost: 0.01 }), true)
})

test('live list allocation keeps saved gestió/prep/rentat and still fills unsaved events', () => {
  const saved = listItem('saved', {
    managementCost: 40,
    preparationCost: 10,
    washingCost: 5,
    subtotal: 155,
  })
  saved.byDepartment.logistica = 155
  const fresh = listItem('fresh')
  const quotas = new Map([
    ['saved', { managementCost: 200, preparationCost: 80, washingCost: 20 }],
    ['fresh', { managementCost: 200, preparationCost: 80, washingCost: 20 }],
  ])
  const savedDepartmentsByEventId = new Map([
    [
      'saved',
      {
        logistica: { managementCost: 40, preparationCost: 10, washingCost: 5 },
        serveis: { managementCost: 0, preparationCost: 0, washingCost: 0 },
        cuina: { managementCost: 0, preparationCost: 0, washingCost: 0 },
      },
    ],
  ])

  applyLiveStructureQuotasToListItems({
    items: [saved, fresh],
    quotas,
    dept: 'logistica',
    savedDepartmentsByEventId,
  })

  assert.equal(saved.detailByDepartment.logistica.managementCost, 40)
  assert.equal(saved.detailByDepartment.logistica.preparationCost, 10)
  assert.equal(saved.detailByDepartment.logistica.washingCost, 5)
  assert.equal(saved.byDepartment.logistica, 155)

  assert.equal(fresh.detailByDepartment.logistica.managementCost, 200)
  assert.equal(fresh.detailByDepartment.logistica.preparationCost, 80)
  assert.equal(fresh.detailByDepartment.logistica.washingCost, 20)
  assert.equal(fresh.byDepartment.logistica, 400)
})

test('edició/resultats list uses the helper that preserves saved sheets', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/lib/costServeis/buildListItems.ts'),
    'utf8'
  )
  assert.match(source, /applyLiveStructureQuotasToListItems/)
  assert.match(source, /savedDepartmentsByEventId/)
  assert.doesNotMatch(
    source,
    /detail\.managementCost\s*=\s*q\.managementCost/,
    'list must not overwrite structure costs inline'
  )
})

test('event GET skips live allocation when the saved fitxa already has structure costs', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/cost-serveis/events/[eventId]/route.ts'),
    'utf8'
  )
  assert.match(source, /hasSavedStructureCosts/)
  assert.match(source, /if \(existing && hasSavedStructureCosts\(prev\)\)/)
})
