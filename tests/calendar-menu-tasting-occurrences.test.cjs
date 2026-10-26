const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildMenuTastingOccurrence,
  groupWeddingMenuTastingOccurrences,
  MENU_TASTING_CONFIGS,
  menuTastingIsoDay,
} = require('../src/lib/calendar/menuTastingOccurrences')

const sourceEvent = {
  summary: 'PROVA',
  collection: 'stage_verd',
  lnLabel: 'Casaments',
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
    sourceEvent: {
      summary: 'PROVA',
      code: '',
      location: '',
      lnLabel: 'Casaments',
    },
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
  assert.equal(menuTastingIsoDay('31/02/2026'), null)

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

test('reads the localized wedding dates returned by Zoho', () => {
  assert.equal(
    menuTastingIsoDay('Dissabte (09.01.2027 - 12:30 h)'),
    '2027-01-09'
  )
  assert.equal(menuTastingIsoDay('Dimecres (17.02.2027)'), '2027-02-17')

  const first = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData: {
      Data_1_Prova_Men: 'Dissabte (09.01.2027 - 12:30 h)',
      Ubicaci_1a_Part: 'Restaurant Mirador (CCR00006)',
      Comensals: 3,
    },
    sourceEventId: 'zoho-gisela',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2027-01-01',
    rangeEnd: '2027-01-31',
  })
  const second = buildMenuTastingOccurrence({
    sourceEvent,
    sourceData: {
      Data_2a_Part_Tast: 'Dimecres (17.02.2027)',
      Ubicaci_2a_part: 'Restaurant Mirador (CCR00006)',
      Comensals_2a: 5,
    },
    sourceEventId: 'zoho-gisela',
    config: MENU_TASTING_CONFIGS[1],
    rangeStart: '2027-02-01',
    rangeEnd: '2027-02-28',
  })

  assert.equal(first.start, '2027-01-09T12:30:00')
  assert.equal(first.location, 'Restaurant Mirador')
  assert.equal(first.numPax, 3)
  assert.equal(second.start, '2027-02-17T12:00:00')
  assert.equal(second.location, 'Restaurant Mirador')
  assert.equal(second.numPax, 5)
})

test('builds an Empresa menu tasting from the dedicated Zoho fields when confirmed', () => {
  const occurrence = buildMenuTastingOccurrence({
    sourceEvent: { ...sourceEvent, lnLabel: 'Empresa' },
    sourceData: {
      Data_i_hora: '2026-09-18T16:45:00+02:00',
      Ubicaci: 'Sala Empresa',
      Pax: 30,
      confirmar_prova: true,
    },
    sourceEventId: 'zoho-company-1',
    config: MENU_TASTING_CONFIGS[2],
    rangeStart: '2026-09-01',
    rangeEnd: '2026-09-30',
  })

  assert.equal(occurrence.id, 'zoho-company-1::pme')
  assert.equal(occurrence.start, '2026-09-18T16:45:00')
  assert.equal(occurrence.location, 'Sala Empresa')
  assert.equal(occurrence.numPax, 30)
  assert.equal(occurrence.code, 'CEU0123')
  assert.equal(occurrence.calendarOccurrenceType, 'menu_tasting_company')
  assert.equal(
    occurrence.summary,
    'PM_PROVA · Sala Empresa · 30 pax'
  )
})

test('builds tastings regardless of business line or company confirmation state', () => {
  const unconfirmedCompany = buildMenuTastingOccurrence({
    sourceEvent: { ...sourceEvent, lnLabel: 'Agenda' },
    sourceData: {
      Data_i_hora: '2026-09-18T16:45:00+02:00',
      confirmar_prova: false,
    },
    sourceEventId: 'zoho-company-1',
    config: MENU_TASTING_CONFIGS[2],
    rangeStart: '2026-09-01',
    rangeEnd: '2026-09-30',
  })
  const companyWithoutConfirmation = buildMenuTastingOccurrence({
    sourceEvent: { ...sourceEvent, lnLabel: 'Altres' },
    sourceData: {
      Data_i_hora: '2027-02-17T13:00:00+01:00',
      Ubicaci: "Restaurant La Masia d'Esplugues (CCE00006)",
      Pax: 3,
      confirmar_prova: null,
    },
    sourceEventId: 'zoho-company-without-confirmation',
    config: MENU_TASTING_CONFIGS[2],
    rangeStart: '2027-02-01',
    rangeEnd: '2027-02-28',
  })
  const confirmedCompany = buildMenuTastingOccurrence({
    sourceEvent: { ...sourceEvent, lnLabel: 'Agenda' },
    sourceData: {
      Data_i_hora: '2026-09-18T16:45:00+02:00',
      confirmar_prova: true,
    },
    sourceEventId: 'zoho-company-1',
    config: MENU_TASTING_CONFIGS[2],
    rangeStart: '2026-09-01',
    rangeEnd: '2026-09-30',
  })
  const weddingFieldsOnAnotherLine = buildMenuTastingOccurrence({
    sourceEvent: { ...sourceEvent, lnLabel: 'Grups Restaurants' },
    sourceData: { Data_1_Prova_Men: '2026-09-18' },
    sourceEventId: 'zoho-company-1',
    config: MENU_TASTING_CONFIGS[0],
    rangeStart: '2026-09-01',
    rangeEnd: '2026-09-30',
  })

  assert.equal(unconfirmedCompany.calendarOccurrenceType, 'menu_tasting_company')
  assert.equal(unconfirmedCompany.menuTastingConfirmed, false)
  assert.equal(companyWithoutConfirmation.start, '2027-02-17T13:00:00')
  assert.equal(companyWithoutConfirmation.numPax, 3)
  assert.equal(companyWithoutConfirmation.menuTastingConfirmed, false)
  assert.equal(confirmedCompany.calendarOccurrenceType, 'menu_tasting_company')
  assert.equal(confirmedCompany.menuTastingConfirmed, true)
  assert.equal(weddingFieldsOnAnotherLine.calendarOccurrenceType, 'menu_tasting_1')
})

test('groups simultaneous Casaments tastings by time and location', () => {
  const shared = {
    calendarOccurrenceType: 'menu_tasting_1',
    start: '2026-11-07T12:30:00',
    end: '2026-11-07T12:30:00',
    location: 'Cal Blay',
    lnLabel: 'Casaments',
  }
  const grouped = groupWeddingMenuTastingOccurrences([
    {
      ...shared,
      id: 'z1::pm1',
      sourceEventId: 'z1',
      sourceEventName: 'Casament A',
      code: 'CEU0001',
      numPax: 3,
      servei: 'MENU CASAMENT CB2',
      files: [{ key: 'z1:file1', url: 'https://example.test/a.pdf', name: 'A.pdf' }],
    },
    {
      ...shared,
      id: 'z2::pm1',
      sourceEventId: 'z2',
      sourceEventName: 'Casament B',
      code: 'CEU0002',
      numPax: 5,
      servei: 'MENU CASAMENT CB3',
      files: [{ key: 'z2:file1', url: 'https://example.test/b.pdf', name: 'B.pdf' }],
    },
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].id, 'pmw-20261107123000-cal-blay')
  assert.equal(grouped[0].summary, 'PM_Casament A + Casament B · Cal Blay · 8 pax')
  assert.equal(grouped[0].numPax, 8)
  assert.equal(
    grouped[0].servei,
    'MENU CASAMENT CB2: 3 pax / MENU CASAMENT CB3: 5 pax'
  )
  assert.deepEqual(grouped[0].serviceBreakdown, [
    { service: 'MENU CASAMENT CB2', pax: 3 },
    { service: 'MENU CASAMENT CB3', pax: 5 },
  ])
  assert.equal(grouped[0].code, 'CEU0001, CEU0002')
  assert.deepEqual(grouped[0].sourceEventIds, ['z1', 'z2'])
  assert.deepEqual(grouped[0].sourceEvents, [
    { id: 'z1', name: 'Casament A', code: 'CEU0001' },
    { id: 'z2', name: 'Casament B', code: 'CEU0002' },
  ])
  assert.deepEqual(
    grouped[0].files.map((file) => file.name),
    ['Casament A · A.pdf', 'Casament B · B.pdf']
  )
})

test('does not group Casaments tastings at different times or Empresa tastings', () => {
  const occurrences = [
    {
      id: 'z1::pm1',
      sourceEventId: 'z1',
      sourceEventName: 'Casament A',
      calendarOccurrenceType: 'menu_tasting_1',
      start: '2026-11-07T12:30:00',
      location: 'Cal Blay',
    },
    {
      id: 'z2::pm1',
      sourceEventId: 'z2',
      sourceEventName: 'Casament B',
      calendarOccurrenceType: 'menu_tasting_1',
      start: '2026-11-07T13:00:00',
      location: 'Cal Blay',
    },
    {
      id: 'z3::pme',
      sourceEventId: 'z3',
      sourceEventName: 'Empresa A',
      calendarOccurrenceType: 'menu_tasting_company',
      start: '2026-11-07T12:30:00',
      location: 'Cal Blay',
    },
  ]

  assert.equal(groupWeddingMenuTastingOccurrences(occurrences).length, 3)
})

test('keeps the Casaments PM id stable when another tasting joins the same slot', () => {
  const first = {
    id: 'z1::pm1',
    sourceEventId: 'z1',
    sourceEventName: 'Casament A',
    calendarOccurrenceType: 'menu_tasting_1',
    start: '2026-11-07T12:30:00',
    location: 'Cal Blay',
    numPax: 8,
  }
  const second = {
    ...first,
    id: 'z2::pm1',
    sourceEventId: 'z2',
    sourceEventName: 'Casament B',
  }

  const oneId = groupWeddingMenuTastingOccurrences([first])[0].id
  const groupedId = groupWeddingMenuTastingOccurrences([first, second])[0].id
  assert.equal(oneId, groupedId)
  assert.equal(groupedId, 'pmw-20261107123000-cal-blay')
})
