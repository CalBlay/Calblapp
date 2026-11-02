const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const originalLoad = Module._load
Module._load = function loadForDashboardAggregationTest(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/firebaseAdmin') return { firestoreAdmin: {} }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  buildDashboardLoadingLinesByEventKey,
} = require('../src/lib/logistics/logisticsLoading.server')
Module._load = originalLoad

function form(eventRowId, carts) {
  return {
    eventRowId,
    warehouseCode: 'BODEGA',
    carts,
    euroPallets: 0,
    americanPallets: 0,
    racks: 0,
    gelPileBags: 0,
    gelStoneBags: 0,
    gelMojitoBags: 0,
    machinery: [],
    smallMachinery: [],
    logisticsPacks: [],
    palletJacks: [],
    missingArticles: [],
    notes: '',
    status: 'completed',
  }
}

test('dashboard loading aggregates sibling services by parent event before applying checklist state', () => {
  const records = [
    { eventKey: 'parent-1', form: form('service-a', 2) },
    { eventKey: 'parent-1', form: form('service-b', 3) },
  ]
  const checklists = new Map([
    ['parent-1', {
      'BODEGA:carts': {
        loaded: true,
        quantity: 5,
        at: 123,
        userId: 'loader-1',
        userName: 'Carregador',
      },
    }],
  ])

  const result = buildDashboardLoadingLinesByEventKey(records, checklists)
  const carts = result.get('parent-1').find((line) => line.key === 'BODEGA:carts')

  assert.equal(carts.quantity, 5)
  assert.equal(carts.loaded, true)
  assert.equal(carts.loadedByName, 'Carregador')
})

test('dashboard loading never mixes different parent events', () => {
  const result = buildDashboardLoadingLinesByEventKey([
    { eventKey: 'parent-1', form: form('service-a', 2) },
    { eventKey: 'parent-2', form: form('service-b', 7) },
  ], new Map())

  assert.equal(result.get('parent-1').find((line) => line.key === 'BODEGA:carts').quantity, 2)
  assert.equal(result.get('parent-2').find((line) => line.key === 'BODEGA:carts').quantity, 7)
})

test('unprepared articles remain visible as pending in truck loading', () => {
  const pendingForm = form('service-a', 0)
  pendingForm.missingArticles = [{
    articleCode: 'ART-001',
    articleName: 'Copa de vi',
    quantity: 12,
    reason: 'pendent',
    prepared: false,
  }]

  const result = buildDashboardLoadingLinesByEventKey([
    { eventKey: 'parent-1', form: pendingForm },
  ], new Map())
  const pendingLine = result
    .get('parent-1')
    .find((line) => line.key === 'missing:BODEGA:ART-001')

  assert.ok(pendingLine)
  assert.equal(pendingLine.label, 'Pendent de preparar · Copa de vi')
  assert.equal(pendingLine.quantity, 12)
  assert.equal(pendingLine.ready, false)
  assert.equal(pendingLine.loaded, false)
  assert.deepEqual(pendingLine.pendingRefs, [{
    eventRowId: 'service-a',
    warehouseCode: 'BODEGA',
    articleCode: 'ART-001',
  }])
})
