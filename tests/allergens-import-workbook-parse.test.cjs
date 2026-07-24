const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalize,
  inferHeaderRowIndex,
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
