const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  articleCodePrefix,
  compareCodePrefixes,
  eventComandaQtyUnit,
  mergeDuplicateErpLines,
  parseErpExcelRows,
  sortFamilies,
} = require('../src/lib/eventComanda/parseErpExcel')

function erpRow({ code = '', name = '', qty = '', unit = '' } = {}) {
  const row = Array(19).fill('')
  row[0] = code
  row[3] = name
  row[14] = qty
  row[17] = unit
  return row
}

test('eventComandaQtyUnit normalizes fragments and keeps ONU', () => {
  assert.equal(eventComandaQtyUnit(''), 'UN')
  assert.equal(eventComandaQtyUnit('O'), 'UN')
  assert.equal(eventComandaQtyUnit('NU'), 'UN')
  assert.equal(eventComandaQtyUnit('UNI'), 'UN')
  assert.equal(eventComandaQtyUnit('UNNU'), 'UN')
  assert.equal(eventComandaQtyUnit('kg...'), 'KG')
  assert.equal(eventComandaQtyUnit('ONU'), 'ONU')
})

test('articleCodePrefix and sortFamilies put numeric families first', () => {
  assert.equal(articleCodePrefix(''), '??')
  assert.equal(articleCodePrefix('09VINS'), '09')
  assert.equal(articleCodePrefix('l'), 'L')
  assert.ok(compareCodePrefixes('09', 'LC') < 0)
  assert.ok(compareCodePrefixes('LC', '09') > 0)
  assert.deepEqual(sortFamilies(['LC', '09', 'Z0']), ['09', 'LC', 'Z0'])
})

test('parseErpExcelRows reads A/D/O/R, skips headers, and extracts the date range', () => {
  const result = parseErpExcelRows([
    ['FECHAS: 01/08/2026 - 03/08/2026'],
    erpRow({ code: 'SIN FAMILIA', name: 'header' }),
    erpRow({ code: 'ARTICULO', name: 'ARTICULO' }),
    erpRow({ code: 'ABC', name: 'too short' }),
    erpRow({ code: 'NO-DIGITS', name: 'alpha only' }),
    erpRow({ code: '09VINS', name: 'Vi blanc', qty: '2,5', unit: 'UN' }),
    erpRow({ code: 'LC001', name: 'Llet', qty: 4, unit: 'L' }),
    erpRow({ code: '09PAE', name: '', qty: 1, unit: 'UN' }),
    erpRow({ code: '09ZERO', name: 'Zero', qty: 0, unit: 'UN' }),
  ])

  assert.equal(result.dateRangeLabel, '01/08/2026 - 03/08/2026')
  const codes = result.lines.map((line) => line.articleCode).sort()
  assert.deepEqual(codes, ['09VINS', 'LC001'])
  assert.equal(result.lines.find((line) => line.articleCode === '09VINS').qtyInitial, 2.5)
  assert.equal(result.lines.find((line) => line.articleCode === 'LC001').qtyUnit, 'L')
  assert.ok(result.warnings.some((warning) => warning.includes('09PAE')))
  assert.ok(result.warnings.some((warning) => warning.includes('09ZERO') || warning.includes('Sense quantitat')))
})

test('mergeDuplicateErpLines sums qty, keeps the first unit, and warns on name/unit mismatch', () => {
  const warnings = []
  const merged = mergeDuplicateErpLines(
    [
      {
        articleCode: '09VINS',
        articleName: 'Vi blanc',
        family: '09',
        qtyInitial: 2,
        qtyUnit: 'UN',
      },
      {
        articleCode: '09vins',
        articleName: 'Vi Blanc Reserva',
        family: '09',
        qtyInitial: 1.25,
        qtyUnit: 'C',
      },
    ],
    warnings
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0].qtyInitial, 3.25)
  assert.equal(merged[0].qtyUnit, 'UN')
  assert.ok(warnings.some((warning) => /nom diferent/i.test(warning)))
  assert.ok(warnings.some((warning) => /unitats diferents/i.test(warning)))
})
