const assert = require('node:assert/strict')
const { test } = require('node:test')

const { parseArticlesCatalogRows } = require('../src/lib/eventComanda/parseArticlesCatalogExcel')

const row = ({
  code = '',
  name = '',
  unit = '',
  warehouse = '',
  group = '',
  groupName = '',
  family = '',
  familyName = '',
  subfamily = '',
  subfamilyName = '',
} = {}) => [
  code,
  name,
  unit,
  warehouse,
  group,
  groupName,
  family,
  familyName,
  subfamily,
  subfamilyName,
]

test('parseArticlesCatalogRows skips header, empty, and TEST_DELSYS rows', () => {
  const result = parseArticlesCatalogRows([
    row({ code: 'Codi', name: 'Nom', warehouse: 'Magatzem' }),
    row(),
    row({ code: 'TEST_DELSYS_01', name: 'Dummy', warehouse: 'WH1' }),
    row({ code: 'xxTEST_DELSYSxx', name: 'Also dummy', warehouse: 'WH1' }),
    row({ code: 'a-1', name: '  Base   tomàquet ', unit: 'kg', warehouse: 'wh1' }),
  ])

  assert.equal(result.lines.length, 1)
  assert.equal(result.lines[0].articleCode, 'A-1')
  assert.equal(result.lines[0].articleName, 'Base tomàquet')
  assert.equal(result.lines[0].unit, 'KG')
  assert.equal(result.lines[0].warehouseCode, 'WH1')
  assert.equal(result.stats.articleCount, 1)
  assert.equal(result.stats.warehouseCount, 1)
})

test('parseArticlesCatalogRows omits missing warehouse and last duplicate wins', () => {
  const result = parseArticlesCatalogRows([
    row({ code: 'code', name: 'Name', warehouse: 'WH' }),
    row({ code: 'DUP', name: 'First', unit: 'UN', warehouse: 'WH1', family: 'F1' }),
    row({ code: 'DUP', name: 'Second', unit: 'KG', warehouse: 'WH2', family: 'F2' }),
    row({ code: 'NOW', name: 'No warehouse', unit: 'UN' }),
    row({ code: 'NONAME', warehouse: 'WH1' }),
  ])

  assert.equal(result.lines.length, 1)
  assert.equal(result.lines[0].articleName, 'Second')
  assert.equal(result.lines[0].warehouseCode, 'WH2')
  assert.equal(result.lines[0].unit, 'KG')
  assert.ok(result.warnings.some((w) => w.includes('DUP') && w.includes('duplicat')))
  assert.ok(result.warnings.some((w) => w.includes('NOW') && w.includes('sense codi de magatzem')))
  assert.equal(result.stats.familyCount, 1)
})

test('parseArticlesCatalogRows defaults empty units to UN and sorts by code', () => {
  const result = parseArticlesCatalogRows([
    row({ code: 'B2', name: 'Beta', warehouse: 'WH' }),
    row({ code: 'A1', name: 'Alpha', warehouse: 'WH' }),
  ])
  assert.deepEqual(
    result.lines.map((line) => line.articleCode),
    ['A1', 'B2']
  )
  assert.equal(result.lines[0].unit, 'UN')
  assert.equal(result.stats.unitCount, 1)
})

test('parseArticlesCatalogRows warns when no valid articles remain', () => {
  const empty = parseArticlesCatalogRows([])
  assert.deepEqual(empty.lines, [])
  assert.ok(empty.warnings.some((w) => w.includes('No s\'han detectat articles vàlids')))

  const onlyBlanks = parseArticlesCatalogRows([row({ code: '   ', name: 'X' })])
  assert.equal(onlyBlanks.lines.length, 0)
  assert.ok(onlyBlanks.warnings.some((w) => w.includes("files sense codi d'article")))
})
