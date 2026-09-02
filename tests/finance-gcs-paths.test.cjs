const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')

const { financeGcsBase, financeKindSegment } = require('../src/lib/server/financeGcsPaths')

const ENV_KEYS = [
  'FINANCE_PATH_RH',
  'FINANCE_PATH_COSTOS',
  'FINANCE_PATH_VENDES',
  'FINANCE_PATH_COMPRES',
  'GCS_FINANCE_BASE',
]

const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function withEnv(updates, fn) {
  for (const key of ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const value = updates[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  return fn()
}

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('financeKindSegment uses kind defaults when env is unset', () => {
  withEnv(
    {
      FINANCE_PATH_RH: undefined,
      FINANCE_PATH_COSTOS: undefined,
      FINANCE_PATH_VENDES: undefined,
      FINANCE_PATH_COMPRES: undefined,
    },
    () => {
      assert.equal(financeKindSegment('rh'), 'RRHH')
      assert.equal(financeKindSegment('costos'), 'c.explotacio')
      assert.equal(financeKindSegment('vendes'), 'vendes')
      assert.equal(financeKindSegment('compres'), 'compres')
    }
  )
})

test('financeKindSegment honors per-kind environment overrides', () => {
  withEnv(
    {
      FINANCE_PATH_RH: 'people',
      FINANCE_PATH_COSTOS: 'pnl',
      FINANCE_PATH_VENDES: 'sales-eu',
      FINANCE_PATH_COMPRES: 'purchases-eu',
    },
    () => {
      assert.equal(financeKindSegment('rh'), 'people')
      assert.equal(financeKindSegment('costos'), 'pnl')
      assert.equal(financeKindSegment('vendes'), 'sales-eu')
      assert.equal(financeKindSegment('compres'), 'purchases-eu')
    }
  )
})

test('financeGcsBase trims slashes and falls back to finances', () => {
  withEnv({ GCS_FINANCE_BASE: undefined }, () => {
    assert.equal(financeGcsBase(), 'finances')
  })
  withEnv({ GCS_FINANCE_BASE: '  /bucket/path/  ' }, () => {
    assert.equal(financeGcsBase(), 'bucket/path')
  })
  withEnv({ GCS_FINANCE_BASE: '   ' }, () => {
    assert.equal(financeGcsBase(), 'finances')
  })
  withEnv({ GCS_FINANCE_BASE: '///' }, () => {
    assert.equal(financeGcsBase(), 'finances')
  })
})
