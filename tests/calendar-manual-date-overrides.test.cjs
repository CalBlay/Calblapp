const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  hasManualDateOverride,
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
