const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  hasManualDateOverride,
  isManualOverrideChange,
  preserveManualCalendarOverrides,
} = require('../src/lib/calendar/manualOverrides')

test('Zoho sync preserves manually overridden event dates', () => {
  const existing = {
    DataInici: '2026-09-12',
    DataFi: '2026-09-14',
    manualOverrides: { DataInici: true, DataFi: true },
  }
  const incoming = {
    DataInici: '2026-09-20',
    DataFi: '2026-09-20',
  }

  assert.deepEqual(preserveManualCalendarOverrides(incoming, existing), {
    DataInici: '2026-09-12',
    DataFi: '2026-09-14',
  })
})

test('Zoho sync still updates dates that were not changed manually', () => {
  const existing = {
    DataInici: '2026-09-12',
    DataFi: '2026-09-12',
    manualOverrides: { NomEvent: true },
  }
  const incoming = {
    DataInici: '2026-09-20',
    DataFi: '2026-09-21',
  }

  assert.deepEqual(preserveManualCalendarOverrides(incoming, existing), incoming)
})

test('a manual override of either boundary protects the event from date cleanup', () => {
  assert.equal(
    hasManualDateOverride({ manualOverrides: { DataInici: true } }),
    true
  )
  assert.equal(
    hasManualDateOverride({ manualOverrides: { DataFi: true } }),
    true
  )
  assert.equal(
    hasManualDateOverride({ manualOverrides: { NomEvent: true } }),
    false
  )
})

test('normalizing a missing DataFi to the unchanged DataInici is not a manual change', () => {
  assert.equal(
    isManualOverrideChange('DataFi', '2026-09-14', {
      DataInici: '2026-09-14',
      DataFi: null,
    }),
    false
  )
})

test('moving a one-day event marks its normalized DataFi as changed', () => {
  assert.equal(
    isManualOverrideChange('DataFi', '2026-09-16', {
      DataInici: '2026-09-14',
      DataFi: null,
    }),
    true
  )
})

test('Zoho writes re-read the latest calendar document transactionally', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/zoho/sync.ts'),
    'utf8'
  )

  assert.match(source, /commitStageDealsPreservingLatestManualChanges/)
  assert.match(source, /firestore\.runTransaction/)
  assert.match(source, /tx\.getAll\(\.\.\.refs\)/)
  assert.match(
    source,
    /preserveLocalCalendarChanges\(dataToSave, latestData\)/
  )
})

test('manual calendar edits are also recorded atomically', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/app/api/calendar/manual/[id]/route.ts'),
    'utf8'
  )

  const putRoute = source.match(
    /export\s+async\s+function\s+PUT\b[\s\S]*?(?=export\s+async\s+function\s+DELETE\b)/
  )?.[0] || ''

  assert.match(putRoute, /db\.runTransaction/)
  assert.match(putRoute, /tx\.get\(docRef\)/)
  assert.match(putRoute, /tx\.set\(/)
})
