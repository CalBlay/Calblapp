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
  code: 'CEU0123',
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
  assert.equal(first.summary, 'PM_CEU0123 · PROVA · Cal Blay · 12 pax')
  assert.equal(first.start, '2026-07-25T12:00:00')
  assert.equal(first.numPax, 12)
  assert.equal(first.calendarOccurrenceType, 'menu_tasting_1')

  assert.equal(second.id, 'zoho-1::pm2')
  assert.equal(second.summary, 'PM2_CEU0123 · PROVA · Cal Blay · 0 pax')
  assert.equal(second.numPax, 0)
  assert.equal(second.calendarOccurrenceType, 'menu_tasting_2')
})

test('omits an unassigned event code and empty tasting details from the title', () => {
  const occurrence = buildMenuTastingOccurrence({
    sourceEvent: { summary: 'PROVA', code: '', location: '' },
    sourceData: { Data_1_Prova_Men: '2026-07-25', Comensals: null },
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2026-07-01',
    rangeEnd: '2026-07-31',
  })

  assert.equal(occurrence.summary, 'PM_PROVA')
})

test('uses automatic tasting dates when the explicit Zoho dates are empty', () => {
  const first = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData: {
      Data_1_Prova_Men: null,
      Auto_data_1a_part: '2027-01-09',
      Comensals: 25,
    },
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2027-01-01',
    rangeEnd: '2027-01-31',
  })
  const second = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData: {
      Data_2a_Part_Tast: null,
      Auto_Data_2a_Part: '2027-02-17',
      Comensals_2a: 25,
    },
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[1],
    rangeStart: '2027-02-01',
    rangeEnd: '2027-02-28',
  })

  assert.equal(first.start, '2027-01-09T12:00:00')
  assert.equal(first.summary, 'PM_CEU0123 · PROVA · Cal Blay · 25 pax')
  assert.equal(second.start, '2027-02-17T12:00:00')
  assert.equal(second.summary, 'PM2_CEU0123 · PROVA · Cal Blay · 25 pax')
})

test('first tasting reads its embedded time and never reuses the second tasting hour', () => {
  const first = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData: {
      Data_1_Prova_Men: 'Dissabte (09.01.2027 - 12:30 h)',
      Auto_data_1a_part: '2027-01-09',
      Hora: '18:30 h',
      Comensals: 25,
    },
    sourceEventId: 'zoho-1',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2027-01-01',
    rangeEnd: '2027-01-31',
  })

  assert.equal(first.start, '2027-01-09T12:30:00')
  assert.equal(first.HoraInici, '12:30')
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
