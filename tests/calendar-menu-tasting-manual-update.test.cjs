const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildMenuTastingManualUpdate,
} = require('../src/lib/calendar/menuTastingManualUpdate')
const {
  CALENDAR_MANUAL_OVERRIDE_FIELDS,
  preserveManualCalendarOverrides,
} = require('../src/lib/calendar/manualOverrides')

test('maps the editable PM modal fields to the first wedding tasting fields', () => {
  assert.deepEqual(
    buildMenuTastingManualUpdate('menu_tasting_1', {
      DataInici: '2027-01-09',
      HoraInici: '12:30',
      Ubicacio: 'Cal Blay',
      NumPax: '8',
    }),
    {
      MenuTasting1Date: '2027-01-09',
      Data_1_Prova_Men: '2027-01-09T12:30:00',
      Ubicaci_1a_Part: 'Cal Blay',
      Comensals: 8,
    }
  )
})

test('maps PM2 and Empresa edits to their dedicated Zoho fields', () => {
  assert.deepEqual(
    buildMenuTastingManualUpdate('menu_tasting_2', {
      DataInici: '2027-02-17',
      HoraInici: '18:45',
      Ubicacio: 'Mirador',
      NumPax: 5,
    }),
    {
      MenuTasting2Date: '2027-02-17',
      Data_2a_Part_Tast: '2027-02-17',
      Hora: '18:45',
      Ubicaci_2a_part: 'Mirador',
      Comensals_2a: 5,
    }
  )
  assert.deepEqual(
    buildMenuTastingManualUpdate('menu_tasting_company', {
      DataInici: '2027-03-11',
      HoraInici: '13:00',
      Ubicacio: 'Sala Empresa',
      NumPax: 30,
    }),
    {
      MenuTastingCompanyDate: '2027-03-11',
      Data_i_hora: '2027-03-11T13:00:00',
      Ubicaci: 'Sala Empresa',
      Pax: 30,
    }
  )
})

test('keeps PM manual edits protected from the next Zoho synchronization', () => {
  assert.equal(CALENDAR_MANUAL_OVERRIDE_FIELDS.has('MenuTasting1Date'), true)
  assert.equal(CALENDAR_MANUAL_OVERRIDE_FIELDS.has('Data_i_hora'), true)

  const preserved = preserveManualCalendarOverrides(
    { MenuTasting1Date: '2027-01-15', Comensals: 12 },
    {
      manualOverrides: { MenuTasting1Date: true, Comensals: true },
      manualOverrideValues: {
        MenuTasting1Date: '2027-01-09',
        Comensals: 8,
      },
    }
  )

  assert.equal(preserved.MenuTasting1Date, '2027-01-09')
  assert.equal(preserved.Comensals, 8)
})

