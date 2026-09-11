const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  hasManualDateOverride,
  isManualOverrideChange,
  preserveManualCalendarOverrides,
  readManualOverrideValues,
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

test('stored manual values survive an unsafe overwrite from another module', () => {
  const existing = {
    NomEvent: 'CALZEDONIA / 15/09/26 / 60',
    DataFi: '2026-09-16',
    manualOverrides: { NomEvent: true, DataFi: true },
    manualOverrideValues: {
      NomEvent: 'CALZEDONIA',
      DataFi: '2026-09-15',
    },
  }
  const incoming = {
    NomEvent: 'CALZEDONIA / 15/09/26 / 60',
    DataFi: '2026-09-16',
  }

  assert.deepEqual(preserveManualCalendarOverrides(incoming, existing), {
    NomEvent: 'CALZEDONIA',
    DataFi: '2026-09-15',
  })
})

test('falsy stored override values still beat a later overwrite', () => {
  assert.deepEqual(
    preserveManualCalendarOverrides(
      { NomEvent: 'FROM_ZOHO', NumPax: 80 },
      {
        NomEvent: 'FROM_ZOHO',
        NumPax: 80,
        manualOverrides: { NomEvent: true, NumPax: true },
        manualOverrideValues: { NomEvent: '', NumPax: 0 },
      }
    ),
    { NomEvent: '', NumPax: 0 }
  )
  assert.deepEqual(
    preserveManualCalendarOverrides(
      { NumPax: 80 },
      {
        NumPax: 80,
        manualOverrides: { NumPax: true },
        manualOverrideValues: { NumPax: null },
      }
    ),
    { NumPax: null }
  )
})

test('invalid override copies fall back to the document field and ignore unmarked fields', () => {
  assert.deepEqual(readManualOverrideValues({ manualOverrideValues: 'nope' }), {})
  assert.deepEqual(readManualOverrideValues(undefined), {})
  assert.deepEqual(
    preserveManualCalendarOverrides(
      { NomEvent: 'FROM_ZOHO', DataInici: '2026-09-20' },
      {
        NomEvent: 'MANUAL',
        DataInici: '2026-09-12',
        manualOverrides: { NomEvent: true, DataInici: false },
        manualOverrideValues: 'broken',
      }
    ),
    { NomEvent: 'MANUAL', DataInici: '2026-09-20' }
  )
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
  assert.match(putRoute, /manualOverrideValues/)
  assert.match(putRoute, /lastWriteSource:\s*'calendar-modal'/)
})

test('auxiliary calendar writers are guarded and identify their source', () => {
  const logistics = fs.readFileSync(
    path.join(__dirname, '../src/app/api/logistics/update/route.ts'),
    'utf8'
  )
  const board = fs.readFileSync(
    path.join(__dirname, '../src/app/api/pissarra/update/route.ts'),
    'utf8'
  )

  assert.match(logistics, /manualOverrideValues\.\$\{field\}/)
  assert.match(logistics, /lastWriteSource\s*=\s*'logistics'/)
  assert.match(board, /CALENDAR_MANUAL_OVERRIDE_FIELDS\.has\(field\)/)
  assert.match(board, /lastWriteSource:\s*'pissarra'/)
})
