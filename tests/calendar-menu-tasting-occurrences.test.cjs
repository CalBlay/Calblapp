const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildMenuTastingOccurrence,
  MENU_TASTING_CONFIGS,
  menuTastingIsoDay,
} = require('../src/lib/calendar/menuTastingOccurrences')

const sourceEvent = {
  summary: 'PROVA',
  collection: 'stage_verd',
  lnLabel: 'Empresa',
  comercial: 'Anna',
  location: 'Cal Blay',
}

test('builds PM and PM2 virtual occurrences with their own date and pax', () => {
  const sourceData = {
    Data_1_Prova_Men: '2026-07-25',
    Comensals: 12,
    Data_2a_Part_Tast: '2026-08-15',
    Comensals_2a: 0,
    Hora: '18:30 h',
  }

  const first = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData,
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2026-07-01',
    rangeEnd: '2026-07-31',
  })
  const second = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData,
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[1],
    rangeStart: '2026-08-01',
    rangeEnd: '2026-08-31',
  })

  assert.equal(first.id, 'zoho-1::pm1')
  assert.equal(first.sourceEventId, 'zoho-1')
  assert.equal(first.summary, 'PM_PROVA')
  assert.equal(first.start, '2026-07-25T18:30:00')
  assert.equal(first.numPax, 12)
  assert.equal(first.calendarOccurrenceType, 'menu_tasting_1')

  assert.equal(second.id, 'zoho-1::pm2')
  assert.equal(second.summary, 'PM2_PROVA')
  assert.equal(second.numPax, 0)
  assert.equal(second.calendarOccurrenceType, 'menu_tasting_2')
})

test('does not build occurrences for null, invalid, or out-of-range dates', () => {
  assert.equal(menuTastingIsoDay(null), null)
  assert.equal(menuTastingIsoDay('25/07/2026'), null)

  const occurrence = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData: { Data_1_Prova_Men: '2026-07-25' },
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2026-08-01',
    rangeEnd: '2026-08-31',
  })
  assert.equal(occurrence, null)
})
