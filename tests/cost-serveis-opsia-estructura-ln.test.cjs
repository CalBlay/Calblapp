const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  flattenEstructuraLnMonthsToRows,
  mergeOpsiaEstructuraLnRowWithPrevious,
  normalizeOpsiaEstructuraLnRow,
} = require('../src/lib/costServeis/opsiaEstructuraLnNormalize')

function row(overrides = {}) {
  return normalizeOpsiaEstructuraLnRow({
    lnCodi: 'ln00001',
    lnNom: 'Grups Restaurants',
    ...overrides,
  })
}

test('normalize prefers personalTotalLn then legacy personalTotal / costPersonalLn', () => {
  assert.equal(row({ personalTotalLn: 100, personalTotal: 50 }).personalTotalLn, 100)
  assert.equal(row({ personalTotal: 50, costPersonalLn: 25 }).personalTotalLn, 50)
  assert.equal(row({ costPersonalLn: 25 }).personalTotalLn, 25)
  assert.equal(row({}).personalTotalLn, null)
  assert.equal(row({ personalTotalLn: Number.NaN }).personalTotalLn, null)
})

test('normalize uppercases LN codes, clamps totals, and rejects unknown status/mode', () => {
  const normalized = row({
    lnCodi: 'ln00002',
    execucioEstat: 'PENDING',
    personalIndirecteMode: 'something-else',
    personalTotalLn: -12.345,
    personalIndirecteFixConfigurat: -8,
    estructuraNeta: -1,
    personalExclosLogisticaCuina: 'abc',
  })

  assert.equal(normalized.lnCodi, 'LN00002')
  assert.equal(normalized.execucioEstat, 'SENSE_DADES')
  assert.equal(normalized.personalIndirecteMode, 'RESIDUAL_LN')
  assert.equal(normalized.personalTotalLn, 0)
  assert.equal(normalized.personalIndirecteFixConfigurat, 0)
  // Line amounts use `Number(x) || 0`, so negatives are kept; only the LN total / fix clamp.
  assert.equal(normalized.estructuraNeta, -1)
  assert.equal(normalized.personalExclosLogisticaCuina, 0)
  assert.equal(normalized.vista, 'gestio')
})

test('FIX_DEPARTAMENTS keeps a configured monthly amount and drops non-finite values', () => {
  const fixed = row({
    personalIndirecteMode: 'FIX_DEPARTAMENTS',
    personalIndirecteFixConfigurat: 15000.129,
    execucioEstat: 'LIVE_FALLBACK',
  })
  assert.equal(fixed.personalIndirecteMode, 'FIX_DEPARTAMENTS')
  assert.equal(fixed.personalIndirecteFixConfigurat, 15000.13)
  assert.equal(fixed.execucioEstat, 'LIVE_FALLBACK')

  const missingFix = row({
    personalIndirecteMode: 'FIX_DEPARTAMENTS',
    personalIndirecteFixConfigurat: Number.NaN,
  })
  assert.equal(missingFix.personalIndirecteFixConfigurat, null)
})

test('sync keeps previous LN totals when the live payload omits them', () => {
  const previous = row({
    personalTotalLn: 339888.5,
    personalIndirecteMode: 'FIX_DEPARTAMENTS',
    personalIndirecteFixConfigurat: 20000,
  })
  const live = row({
    personalTotalLn: null,
    personalIndirecteMode: 'FIX_DEPARTAMENTS',
    personalIndirecteFixConfigurat: null,
  })
  const merged = mergeOpsiaEstructuraLnRowWithPrevious(live, previous)
  assert.equal(merged.personalTotalLn, 339888.5)
  assert.equal(merged.personalIndirecteFixConfigurat, 20000)
})

test('sync does not restore a previous fix amount when the LN is back on residual mode', () => {
  const previous = row({
    personalTotalLn: 100,
    personalIndirecteMode: 'FIX_DEPARTAMENTS',
    personalIndirecteFixConfigurat: 20000,
  })
  const live = row({
    personalTotalLn: 0,
    personalIndirecteMode: 'RESIDUAL_LN',
    personalIndirecteFixConfigurat: null,
  })
  const merged = mergeOpsiaEstructuraLnRowWithPrevious(live, previous)
  assert.equal(merged.personalTotalLn, 0)
  assert.equal(merged.personalIndirecteFixConfigurat, null)
  assert.equal(merged.personalIndirecteMode, 'RESIDUAL_LN')
})

test('flatten sorts months and LN codes and defaults missing indirect mode to residual', () => {
  const rows = flattenEstructuraLnMonthsToRows([
    {
      year: 2026,
      month: 2,
      ym: '2026-02',
      vista: 'gestio',
      execucioEstat: 'CONFIRMAT',
      logisticaCuinaPersonal: 0,
      personalCentralSap: 0,
      ratioLogisticaCuina: 0,
      source: 'test',
      syncedAt: '2026-02-01T00:00:00.000Z',
      byLn: {
        LN00002: row({ lnCodi: 'LN00002', lnNom: 'B' }),
        LN00001: {
          ...row({ lnCodi: 'LN00001', lnNom: 'A' }),
          personalIndirecteMode: undefined,
        },
      },
    },
    {
      year: 2026,
      month: 1,
      ym: '2026-01',
      vista: 'gestio',
      execucioEstat: 'CONFIRMAT',
      logisticaCuinaPersonal: 0,
      personalCentralSap: 0,
      ratioLogisticaCuina: 0,
      source: 'test',
      syncedAt: '2026-01-01T00:00:00.000Z',
      byLn: {
        LN00009: row({ lnCodi: 'LN00009', lnNom: 'C' }),
      },
    },
  ])

  assert.deepEqual(
    rows.map((item) => `${item.ym}:${item.lnCodi}`),
    ['2026-01:LN00009', '2026-02:LN00001', '2026-02:LN00002']
  )
  assert.equal(rows[1].personalIndirecteMode, 'RESIDUAL_LN')
  assert.equal(rows[1].personalIndirecteCalculat, null)
})
