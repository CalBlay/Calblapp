const assert = require('node:assert/strict')
const { test } = require('node:test')
const XLSX = require('xlsx')
const { parseImportWorkbook } = require('../src/app/menu/allergens/bbdd/manualImport')

const {
  normalize,
  inferHeaderRowIndex,
  resolveCodeColumn,
  resolveHeaderCells,
  normalizeTypeLabel,
  getGroupLabelForSheet,
  isMarkedMenuCell,
  parseMenusFromRawText,
  parseAptImport,
  parseAllergenImportValue,
  findOnEstanColumn,
  resolveTranslationColumns,
  buildMenuColumns,
  IMPORT_ALLERGEN_HEADERS,
} = require('../src/app/menu/allergens/bbdd/importWorkbookParse')

test('normalize strips accents and punctuation for header matching', () => {
  assert.equal(normalize('Fruits secs'), 'fruits secs')
  assert.equal(normalize('Mol·luscs!!'), 'mol luscs')
})

test('inferHeaderRowIndex finds allergen header rows with code and article columns', () => {
  const rows = [
    ['title', 'ignored'],
    [
      'Num. Codi',
      'Articles',
      'Gluten',
      'Ou',
      'Peix',
      'Soja',
      'Lactosa',
      'Tipus',
    ],
  ]

  assert.equal(inferHeaderRowIndex(rows), 1)
  assert.equal(inferHeaderRowIndex([['a', 'b']]), -1)
})

test('infers a blank code header from product codes below it', () => {
  const rows = [
    ['TÃ­tol del full'],
    ['', 'REFERÃˆNCIES', 'Gluten', 'Crustacis', 'Ou', 'Peix', 'ESP', 'ANG'],
    ['C0530200338', "Amanida cremosa de gambes", 'NO', 'SI', 'NO', 'SI', 'Ensalada', 'Salad'],
    ['C0530200334', "Amanida d'Ã nec", 'NO', 'NO', 'NO', 'NO', 'Ensalada', 'Salad'],
  ]

  // Keep the fixture ASCII-only so this regression is independent of source-file encoding.
  rows[1][1] = 'REFERENCIES'
  const headers = rows[1].map(normalize)
  assert.equal(resolveCodeColumn(rows, 1, headers), 0)
  assert.equal(inferHeaderRowIndex(rows), 1)
})

test('combines split header rows used by the banquet sheet', () => {
  const rows = [
    ['', '', 'Gluten', 'Crustacis', 'Ou', 'Peix', '', 'TRADUCCIONS'],
    ['', 'REFERENCIES', '', '', '', '', '', 'ESP', 'ANG'],
    ['C0530200338', 'Amanida cremosa de gambes', 'NO', 'SI', 'NO', 'SI', '', 'Ensalada', 'Salad'],
    ['C0530200334', "Amanida d'anec", 'NO', 'NO', 'NO', 'NO', '', 'Ensalada', 'Salad'],
  ]

  const headers = resolveHeaderCells(rows, 1)
  assert.equal(headers[1], 'referencies')
  assert.equal(headers[2], 'gluten')
  assert.equal(headers[7], 'esp')
  assert.equal(resolveCodeColumn(rows, 1, headers), 0)
  assert.equal(inferHeaderRowIndex(rows), 1)
})

test('imports the full two-row PLATS BANQUET layout', async () => {
  const top = Array(37).fill('')
  top[0] = 'Num. Codi'
  top[1] = 'REFERENCIES BANQUET EMPRESA + CASAMENTS'
  top[2] = 'TIPUS'
  top[3] = 'ALLERGENS I COMPOSICIO'
  top[19] = 'ON ESTAN AQUESTS PLATS?'
  top[35] = 'TRADUCCIONS'

  const sub = Array(37).fill('')
  ;[
    'Gluten', 'Crustacis', 'Ou', 'Peix', 'Cacauet', 'Soja', 'Lactosa',
    'Fruits Secs', 'Api', 'Mostassa', 'Sesam', 'Sulfits', 'Tramus',
    'Mol.luscs', 'Vegetaria', 'Vega',
  ].forEach((value, index) => { sub[index + 3] = value })
  ;[
    'Bq: Menu 1', 'Bq: Menu 2', 'Bq: Menu 3', 'Bq: Menu Gourmet',
    'Bq: Menu Mediterrani', 'Bq: Menu Vinyes', 'Bq: Menus Especials',
    'Menus - Dinar treball', 'Concurs truites', 'Concurs paelles',
    'Social dinner', 'Casam: CB 2', 'Casam: CB 3', 'Casam: CB 4',
    'Casam: CB 5', 'Alternatives',
  ].forEach((value, index) => { sub[index + 19] = value })
  sub[35] = 'ESP'
  sub[36] = 'ANG'

  const data = Array(37).fill('')
  data[0] = 'C0530200338'
  data[1] = "Amanida cremosa de gambes a l'allet i piparres"
  data[2] = 'ENTRANT'
  ;[
    'NO', 'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO',
    'NO', 'NO', 'SI', 'T', 'NO',
  ].forEach((value, index) => { data[index + 3] = value })
  data[26] = 'x'
  data[29] = 'x'
  data[35] = 'Ensaladilla cremosa de gambas al ajillo y piparras'
  data[36] = 'Creamy salad with garlic prawns and piparras peppers'

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([top, sub, data]), 'PLATS BANQUET')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const file = {
    name: 'banquet.xlsx',
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }

  const result = await parseImportWorkbook(file)
  assert.equal(result.parsedRows.length, 1)
  assert.equal(result.parsedRows[0].code, 'C0530200338')
  assert.equal(result.parsedRows[0].data.categoryLabel, 'ENTRANT')
  assert.equal(result.parsedRows[0].data.allergens.gluten, 'NO')
  assert.equal(result.parsedRows[0].data.allergens.crustacis, 'SI')
  assert.deepEqual(result.parsedRows[0].data.menus, ['Menus - Dinar treball', 'Social dinner'])
  assert.equal(result.parsedRows[0].data.name.es, 'Ensaladilla cremosa de gambas al ajillo y piparras')
  assert.equal(result.parsedRows[0].data.name.en, 'Creamy salad with garlic prawns and piparras peppers')
})

test('type, sheet group, menu mark, and allergen cell parsers handle edge values', () => {
  assert.equal(normalizeTypeLabel('snacks'), 'SNACKS')
  assert.equal(normalizeTypeLabel('-'), '')
  assert.equal(normalizeTypeLabel('Postres'), 'Postres')

  assert.equal(getGroupLabelForSheet('Cuina del Felix'), 'Plat Cuina Felix')
  assert.equal(getGroupLabelForSheet('Custom Sheet'), 'Custom Sheet')

  assert.equal(isMarkedMenuCell('X'), true)
  assert.equal(isMarkedMenuCell('sí'), true)
  assert.equal(isMarkedMenuCell('no'), false)

  assert.deepEqual(parseMenusFromRawText('Menú A | Menú B; Menú A'), ['Menú A', 'Menú B'])
  assert.deepEqual(parseMenusFromRawText('  '), [])

  assert.equal(parseAptImport('No apte'), false)
  assert.equal(parseAptImport('Apte'), true)
  assert.equal(parseAptImport(''), null)

  assert.equal(parseAllergenImportValue('SI'), 'SI')
  assert.equal(parseAllergenImportValue('n/a'), 'NO')
  assert.equal(parseAllergenImportValue('Traces'), 'T')
  assert.equal(parseAllergenImportValue(''), null)
  assert.equal(IMPORT_ALLERGEN_HEADERS['mol luscs'], 'moluscs')
})

test('findOnEstanColumn and translation helpers locate flexible workbook layouts', () => {
  const headers = [
    normalize('Num. Codi'),
    normalize('Articles'),
    normalize('On es troben'),
    normalize('Esp'),
    normalize('Ang'),
  ]
  assert.equal(findOnEstanColumn(headers), 2)

  const rows = [
    ['Num. Codi', 'Articles', 'Castellà', 'English'],
    ['1', 'Pa', 'Pan', 'Bread'],
  ]
  assert.deepEqual(resolveTranslationColumns(rows, 0), { nameEs: 2, nameEn: 3 })
})

test('buildMenuColumns discovers menu labels after vegan/allergen columns', () => {
  const headers = [
    normalize('Num. Codi'),
    normalize('Articles'),
    normalize('Tipus'),
    normalize('Vegetarià'),
    normalize('Vegà'),
    normalize('Menú A'),
    normalize('Menú B'),
    normalize('Gluten'),
    normalize('Ou'),
    normalize('Peix'),
    normalize('Soja'),
  ]
  const rows = [
    [
      'Num. Codi',
      'Articles',
      'Tipus',
      'Vegetarià',
      'Vegà',
      'Menú A',
      'Menú B',
      'Gluten',
      'Ou',
      'Peix',
      'Soja',
    ],
    ['1', 'Pa', 'Snack', 'x', '', 'x', '', 'S', 'N', 'N', 'N'],
  ]

  const allergenCols = {
    gluten: 7,
    ou: 8,
    peix: 9,
    soja: 10,
  }

  assert.deepEqual(buildMenuColumns(rows, 0, headers, allergenCols), [
    { index: 5, label: 'Menú A' },
    { index: 6, label: 'Menú B' },
  ])
})
