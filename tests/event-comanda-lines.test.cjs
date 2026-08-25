const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

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
  searchArticles,
  filterOrderLinesByQuery,
  mergeOrderLinesWithTemplate,
} = require('../src/lib/eventComanda/searchArticles')
const {
  sortComandaLines,
  nextComandaLineSortStack,
} = require('../src/lib/eventComanda/sortLines')
const {
  computeOrderWarehouseIndex,
  orderWarehouseIndexIsMissing,
} = require('../src/lib/eventComanda/orderWarehouseIndex')
const { orderBatchesToLines } = require('../src/lib/eventComanda/orderLines')

after(() => {
  Module._load = originalLoad
})

const article = (overrides = {}) => ({
  articleCode: '09VINS',
  articleName: 'Vi blanc',
  family: '09',
  qtyTemplate: 1,
  inTemplate: true,
  ...overrides,
})

const line = (overrides = {}) => ({
  articleCode: '09VINS',
  articleName: 'Vi blanc',
  family: '09',
  qtyUnit: 'UN',
  qtyTemplate: 1,
  qtyRequested: 2,
  ...overrides,
})

test('searchArticles folds accents, requires every token, and returns [] for blank queries', () => {
  const pool = [
    article({ articleCode: '09PAE', articleName: 'Paëlla', family: '09' }),
    article({ articleCode: 'LC001', articleName: 'Llet', family: 'LC' }),
  ]

  assert.deepEqual(searchArticles(pool, '  '), [])
  assert.equal(searchArticles(pool, 'paella')[0].articleCode, '09PAE')
  assert.equal(searchArticles(pool, '09 vi').length, 0)
  assert.equal(searchArticles(pool, '09 pae')[0].articleCode, '09PAE')
  assert.equal(searchArticles(pool, 'llet', 1).length, 1)
})

test('filterOrderLinesByQuery returns all lines when the query is empty', () => {
  const lines = [line(), line({ articleCode: 'LC001', articleName: 'Llet' })]
  assert.equal(filterOrderLinesByQuery(lines, '').length, 2)
  assert.equal(filterOrderLinesByQuery(lines, 'llet').length, 1)
})

test('mergeOrderLinesWithTemplate keeps requested qty and fills missing template rows', () => {
  const merged = mergeOrderLinesWithTemplate(
    [line({ articleCode: '09vins', qtyRequested: 4, qtyTemplate: 99 })],
    [
      {
        articleCode: '09VINS',
        articleName: 'Vi blanc plantilla',
        family: '09',
        qtyInitial: 8,
        qtyUnit: 'UN',
      },
      {
        articleCode: 'LC001',
        articleName: 'Llet',
        family: 'LC',
        qtyInitial: 3,
        qtyUnit: 'L',
      },
    ]
  )

  const byCode = Object.fromEntries(merged.map((row) => [row.articleCode.toUpperCase(), row]))
  assert.equal(byCode['09VINS'].qtyRequested, 4)
  assert.equal(byCode['09VINS'].qtyTemplate, 8)
  assert.equal(byCode.LC001.qtyRequested, 0)
  assert.equal(byCode.LC001.qtyTemplate, 3)
})

test('sortComandaLines treats missing qty as lowest and falls back warehouse name→code', () => {
  const rows = [
    line({ articleCode: 'B', articleName: 'Beta', qtyRequested: 5, warehouseName: 'Mag' }),
    line({ articleCode: 'A', articleName: 'Alfa', qtyRequested: null, warehouseCode: 'PAR' }),
    line({ articleCode: 'C', articleName: 'Ceba', qtyRequested: 1, warehouseName: 'Mag' }),
  ]

  const byQty = sortComandaLines(rows, [{ key: 'qty', direction: 'asc' }])
  assert.deepEqual(
    byQty.map((row) => row.articleCode),
    ['A', 'C', 'B']
  )

  const byWarehouse = sortComandaLines(rows, [{ key: 'warehouse', direction: 'asc' }])
  assert.equal(byWarehouse[0].articleCode, 'B')
  assert.equal(byWarehouse[byWarehouse.length - 1].articleCode, 'A')
})

test('nextComandaLineSortStack toggles the primary key and keeps at most two criteria', () => {
  const toggled = nextComandaLineSortStack([{ key: 'code', direction: 'asc' }], 'code')
  assert.deepEqual(toggled, [{ key: 'code', direction: 'desc' }])

  const stacked = nextComandaLineSortStack([{ key: 'code', direction: 'asc' }], 'name')
  assert.deepEqual(stacked, [
    { key: 'name', direction: 'asc' },
    { key: 'code', direction: 'asc' },
  ])

  const promoted = nextComandaLineSortStack(stacked, 'code')
  assert.deepEqual(promoted, [{ key: 'code', direction: 'asc' }])
})

test('computeOrderWarehouseIndex skips empty/cancelled lots and splits visible vs history', () => {
  const index = computeOrderWarehouseIndex([
    { warehouseId: ' mag ', status: 'pending', lines: [{ articleCode: 'A' }] },
    { warehouseId: 'PAR', status: 'sent', lines: [{ articleCode: 'B' }] },
    { warehouseId: 'BODEGA', status: 'cancelled', lines: [{ articleCode: 'C' }] },
    { warehouseId: 'EMPTY', status: 'pending', lines: [] },
    { warehouseId: '', status: 'ready', lines: [{ articleCode: 'D' }] },
  ])

  assert.deepEqual(index.warehouseIds.sort(), ['MAG', 'PAR'])
  assert.deepEqual(index.preparerVisibleWarehouseIds, ['MAG'])
  assert.deepEqual(index.preparerHistoryWarehouseIds, ['PAR'])
})

test('orderWarehouseIndexIsMissing is true only after send without a visible-id array', () => {
  assert.equal(orderWarehouseIndexIsMissing({ sentAt: 1 }), true)
  assert.equal(orderWarehouseIndexIsMissing({ sentAt: 1, preparerVisibleWarehouseIds: [] }), false)
  assert.equal(orderWarehouseIndexIsMissing({ sentAt: null, preparerVisibleWarehouseIds: null }), false)
})

test('orderBatchesToLines skips cancelled and empty revisions, later lots overwrite by code', () => {
  const lines = orderBatchesToLines([
    {
      warehouseId: 'MAG',
      warehouseCode: 'MAG',
      warehouseName: 'Magatzem',
      kind: 'primary',
      status: 'pending',
      lines: [
        {
          articleCode: '09VINS',
          articleName: 'Vi',
          family: '09',
          qtyUnit: 'un.',
          qtyTemplate: 1,
          qtyRequested: 2,
        },
      ],
    },
    {
      warehouseId: 'PAR',
      warehouseCode: 'PAR',
      warehouseName: 'Parament',
      kind: 'primary',
      status: 'in_progress',
      lines: [
        {
          articleCode: '09VINS',
          articleName: 'Vi',
          family: '09',
          qtyUnit: 'UN',
          qtyTemplate: 1,
          qtyRequested: 5,
        },
      ],
    },
    {
      warehouseId: 'X',
      warehouseCode: 'X',
      warehouseName: 'X',
      kind: 'revision',
      status: 'pending',
      lines: [
        {
          articleCode: 'LC001',
          articleName: 'Llet',
          family: 'LC',
          qtyUnit: 'L',
          qtyTemplate: 0,
          qtyRequested: 0,
        },
      ],
    },
    {
      warehouseId: 'Z',
      warehouseCode: 'Z',
      warehouseName: 'Z',
      kind: 'primary',
      status: 'cancelled',
      lines: [
        {
          articleCode: 'ZZ1',
          articleName: 'Skip',
          family: 'ZZ',
          qtyUnit: 'UN',
          qtyTemplate: 1,
          qtyRequested: 9,
        },
      ],
    },
  ])

  assert.equal(lines.length, 1)
  assert.equal(lines[0].articleCode, '09VINS')
  assert.equal(lines[0].qtyRequested, 5)
  assert.equal(lines[0].warehouseId, 'PAR')
  assert.equal(lines[0].qtyUnit, 'UN')
})
