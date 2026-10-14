const test = require('node:test')
const assert = require('node:assert/strict')

const {
  filterCalendarDealsBySearch,
  isCalendarSearchActive,
  matchesCalendarSearch,
} = require('../src/lib/calendar/calendarSearch.ts')

const deals = [
  {
    id: 'EV-101',
    NomEvent: 'Casament Júlia i Marc',
    Comercial: 'Mònica Puig',
    ComercialIntern: 'Joan Serra',
    Responsable: 'Anna Solé',
    LN: 'Casaments',
    Servei: 'Sopar',
    StageGroup: 'Confirmat',
    DataInici: '2026-10-24',
    Ubicacio: 'Masia Can Riera',
    NumPax: 120,
    code: 'BODA-24',
    codeStatus: 'confirmed',
    ObservacionsZoho: 'Cerimònia exterior',
  },
  {
    id: 'EV-102',
    NomEvent: 'Jornada empresarial',
    Comercial: 'Pere Vidal',
    Ubicacio: 'Saló Mirador',
    codeStatus: 'missing',
  },
]

test('calendar search activates with two normalized characters', () => {
  assert.equal(isCalendarSearchActive('m'), false)
  assert.equal(isCalendarSearchActive('  mò '), true)
})

test('calendar search ignores accents and searches all useful fields', () => {
  assert.equal(matchesCalendarSearch(deals[0], 'monica'), true)
  assert.equal(matchesCalendarSearch(deals[0], 'cerimonia'), true)
  assert.equal(matchesCalendarSearch(deals[1], 'salo'), true)
})

test('calendar search supports tokens across different fields', () => {
  assert.deepEqual(
    filterCalendarDealsBySearch(deals, 'julia riera').map((deal) => deal.id),
    ['EV-101']
  )
  assert.deepEqual(
    filterCalendarDealsBySearch(deals, 'pere mirador').map((deal) => deal.id),
    ['EV-102']
  )
})

test('calendar search does not filter with fewer than two characters', () => {
  assert.equal(filterCalendarDealsBySearch(deals, 'j'), deals)
})
