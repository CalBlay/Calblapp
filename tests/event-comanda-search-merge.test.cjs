const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  flattenTemplateLines,
  buildOrderLinesFromTemplate,
  mergeOrderLinesWithTemplate,
  mergeWarehouseIntoOrderLines,
  enrichCatalogArticlesWithTemplate,
  searchArticles,
  filterOrderLinesByQuery,
} = require('../src/lib/eventComanda/searchArticles')

const {
  sortComandaLines,
  nextComandaLineSortStack,
  nextComandaLineSort,
} = require('../src/lib/eventComanda/sortLines')

const templateLine = (code, extras = {}) => ({
  articleCode: code,
  articleName: extras.articleName || `Article ${code}`,
  family: extras.family || 'Begudes',
  qtyInitial: extras.qtyInitial ?? 2,
  qtyUnit: extras.qtyUnit || 'UN',
})

const orderLine = (code, extras = {}) => ({
  articleCode: code,
  articleName: extras.articleName || `Article ${code}`,
  family: extras.family || 'Begudes',
  qtyUnit: extras.qtyUnit || 'UN',
  qtyTemplate: extras.qtyTemplate ?? null,
  qtyRequested: extras.qtyRequested ?? 0,
  warehouseId: extras.warehouseId ?? null,
  warehouseCode: extras.warehouseCode ?? null,
  warehouseName: extras.warehouseName ?? null,
})

test('flattenTemplateLines flattens families and sorts by article code', () => {
  const flat = flattenTemplateLines({
    Z: [templateLine('B2'), templateLine('A1')],
    A: [templateLine('C3')],
  })
  assert.deepEqual(
    flat.map((line) => line.articleCode),
    ['A1', 'B2', 'C3']
  )
})

test('mergeOrderLinesWithTemplate is case-insensitive, keeps requested qty, and retains extras', () => {
  const merged = mergeOrderLinesWithTemplate(
    [
      orderLine('a1', { qtyRequested: 7, qtyTemplate: 99, articleName: 'Kept name' }),
      orderLine('X9', { qtyRequested: 1, family: 'Extra' }),
    ],
    [templateLine('A1', { qtyInitial: 4, articleName: 'Template A1' }), templateLine('B2')]
  )

  const byCode = Object.fromEntries(merged.map((line) => [line.articleCode.toUpperCase(), line]))
  assert.equal(byCode.A1.qtyRequested, 7)
  assert.equal(byCode.A1.qtyTemplate, 4)
  assert.equal(byCode.A1.articleName, 'Kept name')
  assert.equal(byCode.B2.qtyRequested, 0)
  assert.equal(byCode.B2.qtyTemplate, 2)
  assert.equal(byCode.X9.qtyRequested, 1)
  assert.equal(byCode.X9.family, 'Extra')
})

test('buildOrderLinesFromTemplate starts requested qty at 0 and copies template qty', () => {
  const lines = buildOrderLinesFromTemplate([templateLine('A1', { qtyInitial: 5 })])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].qtyRequested, 0)
  assert.equal(lines[0].qtyTemplate, 5)
  assert.equal(lines[0].warehouseId, null)
})

test('mergeWarehouseIntoOrderLines matches codes case-insensitively and leaves misses untouched', () => {
  const merged = mergeWarehouseIntoOrderLines(
    [orderLine('a1'), orderLine('B2', { warehouseName: 'Keep' })],
    [{ articleCode: 'A1', warehouseId: 'w1', warehouseCode: 'SEC', warehouseName: 'Sec' }]
  )
  assert.equal(merged[0].warehouseId, 'w1')
  assert.equal(merged[0].warehouseCode, 'SEC')
  assert.equal(merged[1].warehouseName, 'Keep')
})

test('enrichCatalogArticlesWithTemplate marks in-template rows and fills missing unit/family', () => {
  const enriched = enrichCatalogArticlesWithTemplate(
    [
      {
        articleCode: 'a1',
        articleName: 'Cola',
        family: '',
        qtyUnit: '',
        qtyTemplate: null,
        inTemplate: false,
      },
      {
        articleCode: 'Z9',
        articleName: 'Extra',
        family: 'Altres',
        qtyUnit: 'KG',
        qtyTemplate: null,
        inTemplate: false,
      },
    ],
    [templateLine('A1', { family: 'Begudes', qtyUnit: 'UN', qtyInitial: 3 })]
  )
  assert.equal(enriched[0].inTemplate, true)
  assert.equal(enriched[0].qtyTemplate, 3)
  assert.equal(enriched[0].qtyUnit, 'UN')
  assert.equal(enriched[0].family, 'Begudes')
  assert.equal(enriched[1].inTemplate, false)
  assert.equal(enriched[1].qtyUnit, 'KG')
})

test('searchArticles folds accents, requires every token, and returns [] for blank query', () => {
  const pool = [
    {
      articleCode: 'A1',
      articleName: 'Aigua amb gas',
      family: 'Begudes',
      qtyTemplate: null,
      inTemplate: true,
    },
    {
      articleCode: 'B2',
      articleName: 'Pa de pagès',
      family: 'Forn',
      qtyTemplate: null,
      inTemplate: false,
    },
  ]
  assert.deepEqual(searchArticles(pool, '  '), [])
  assert.equal(searchArticles(pool, 'AIGUA').length, 1)
  assert.equal(searchArticles(pool, 'aigua GAS').length, 1)
  assert.equal(searchArticles(pool, 'aigua forn').length, 0)
  assert.equal(searchArticles(pool, 'pages').length, 1)
  assert.equal(searchArticles(pool, 'aigua', 0).length, 0)
})

test('filterOrderLinesByQuery returns all lines when the query is empty', () => {
  const lines = [orderLine('A1'), orderLine('B2')]
  assert.equal(filterOrderLinesByQuery(lines, '').length, 2)
  assert.equal(filterOrderLinesByQuery(lines, 'b2').length, 1)
})

test('sortComandaLines uses the stack, treats missing qty as lowest, and ties on code', () => {
  const lines = [
    orderLine('B2', { qtyRequested: 3, warehouseName: 'Zeta', articleName: 'Beta' }),
    orderLine('A1', { qtyRequested: null, warehouseName: 'Alfa', articleName: 'Alfa' }),
    orderLine('C3', { qtyRequested: 1, warehouseName: 'Alfa', articleName: 'Gamma' }),
  ]
  const byQty = sortComandaLines(lines, [{ key: 'qty', direction: 'asc' }])
  assert.deepEqual(
    byQty.map((line) => line.articleCode),
    ['A1', 'C3', 'B2']
  )
  const byWarehouse = sortComandaLines(lines, [{ key: 'warehouse', direction: 'asc' }])
  assert.deepEqual(
    byWarehouse.map((line) => line.articleCode),
    ['A1', 'C3', 'B2']
  )
  const emptyStack = sortComandaLines(lines, [])
  assert.deepEqual(
    emptyStack.map((line) => line.articleCode),
    ['A1', 'B2', 'C3']
  )
})

test('nextComandaLineSortStack toggles primary direction and promotes a secondary key', () => {
  const toggled = nextComandaLineSortStack([{ key: 'code', direction: 'asc' }], 'code')
  assert.deepEqual(toggled[0], { key: 'code', direction: 'desc' })

  const added = nextComandaLineSortStack([{ key: 'code', direction: 'asc' }], 'name')
  assert.deepEqual(added, [
    { key: 'name', direction: 'asc' },
    { key: 'code', direction: 'asc' },
  ])

  const promoted = nextComandaLineSortStack(
    [
      { key: 'name', direction: 'asc' },
      { key: 'qty', direction: 'desc' },
    ],
    'qty'
  )
  // Promoting a secondary keeps that criterion and drops the previous primary.
  assert.deepEqual(promoted, [{ key: 'qty', direction: 'desc' }])

  assert.deepEqual(nextComandaLineSort('code', 'asc', 'code'), {
    key: 'code',
    direction: 'desc',
  })
})
