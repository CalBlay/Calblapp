const test = require('node:test')
const assert = require('node:assert/strict')

const {
  countSpacesSearchEvents,
  filterSpacesRows,
  normalizeSpacesSearchText,
} = require('../src/lib/spacesSearch.ts')

const rows = [
  {
    finca: 'Masia Can Milà',
    dies: [
      {
        date: '2026-09-22',
        events: [
          {
            eventName: 'Casament Núria i Pol',
            commercial: 'Joan García',
            code: 'EV-2048',
            service: 'Càtering',
            ln: 'Casaments',
            stage: 'verd',
            numPax: 180,
          },
          {
            NomClient: 'Acme Europa',
            Comercial: 'Marta Puig',
            Comentari: 'Reserva de la terrassa',
            stage: 'lila',
            cancelled: true,
          },
        ],
      },
    ],
  },
]

test('normalitza accents, signes i majúscules', () => {
  assert.equal(normalizeSpacesSearchText('  Núria · CÀTERING  '), 'nuria catering')
})

test('combina paraules de camps diferents sense accents', () => {
  const result = filterSpacesRows(rows, 'mila garcia cater')
  assert.equal(countSpacesSearchEvents(result), 1)
  assert.equal(result[0].dies[0].events[0].code, 'EV-2048')
})

test('entén les etiquetes humanes dels estats', () => {
  assert.equal(countSpacesSearchEvents(filterSpacesRows(rows, 'confirmat')), 1)
  assert.equal(countSpacesSearchEvents(filterSpacesRows(rows, 'reserva manual')), 1)
})

test('retorna una graella buida quan no hi ha coincidències', () => {
  assert.deepEqual(filterSpacesRows(rows, 'inexistent'), [])
})

test('permet cercar reserves cancel·lades', () => {
  const result = filterSpacesRows(rows, 'cancel·lada acme')
  assert.equal(countSpacesSearchEvents(result), 1)
})
