const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  CEU_BASE_FALLBACK,
  parseCeuNumber,
  parseCeuNumberStrict4,
  nextCEUCode,
  resolveFincaLnForNewCode,
} = require('../src/services/zoho/sync-finques-codes')

test('parseCeuNumber reads numeric suffix and ignores case', () => {
  assert.equal(parseCeuNumber('CEU0173'), 173)
  assert.equal(parseCeuNumber('ceu9'), 9)
  assert.equal(Number.isNaN(parseCeuNumber('CCR001')), true)
})

test('parseCeuNumberStrict4 only accepts CEU + exactly 4 digits', () => {
  assert.equal(parseCeuNumberStrict4('CEU0173'), 173)
  assert.equal(parseCeuNumberStrict4('ceu9999'), 9999)
  assert.equal(parseCeuNumberStrict4('CEU173'), null)
  assert.equal(parseCeuNumberStrict4('CEU01731'), null)
  assert.equal(parseCeuNumberStrict4('CCR0001'), null)
  assert.equal(parseCeuNumberStrict4(''), null)
})

test('nextCEUCode advances from max or falls back to CEU_BASE_FALLBACK+1', () => {
  assert.equal(nextCEUCode(null), `CEU${String(CEU_BASE_FALLBACK + 1).padStart(4, '0')}`)
  assert.equal(nextCEUCode(172), 'CEU0173')
  assert.equal(nextCEUCode(999), 'CEU1000')
})

test('resolveFincaLnForNewCode maps prefixes, restaurant keywords, and CEU deal LN', () => {
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CCR01', locationName: 'Can X' }),
    'Grups Restaurants'
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CEU0200', locationName: 'Restaurant Can Blay' }),
    'Grups Restaurants'
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CCB10', locationName: 'Masia' }),
    'Casaments'
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CCE10', locationName: 'Masia' }),
    'Empreses'
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CCF10', locationName: 'Masia' }),
    'Foodlovers'
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CEU0200', locationName: 'Masia', dealLn: 'Casaments' }),
    'Casaments'
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'CEU0200', locationName: 'Masia', dealLn: null }),
    ''
  )
  assert.equal(
    resolveFincaLnForNewCode({ code: 'XYZ1', locationName: 'Masia' }),
    ''
  )
})
