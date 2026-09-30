const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ALL_PISSARRA_PERSONNEL,
  defaultPissarraPersonnelFilter,
  getLogisticsPersonnelNames,
  logisticsItemIncludesPerson,
} = require('../src/lib/pissarraPersonnelFilter')

test('un treballador de logística queda filtrat pel seu nom per defecte', () => {
  assert.equal(
    defaultPissarraPersonnelFilter({
      role: 'treballador',
      department: 'Logística',
      userName: 'Xavier Díaz',
    }),
    'Xavier Díaz'
  )
})

test('altres rols o departaments veuen tota la pissarra per defecte', () => {
  assert.equal(
    defaultPissarraPersonnelFilter({
      role: 'cap',
      department: 'Logística',
      userName: 'Responsable',
    }),
    ALL_PISSARRA_PERSONNEL
  )
})

test('el filtre troba la persona com a treballador o conductor ignorant accents i caixa', () => {
  const item = {
    workers: ['Julián Ramón'],
    vehicles: [{ conductor: 'Xavier Díaz' }],
  }

  assert.equal(logisticsItemIncludesPerson(item, 'julian ramon'), true)
  assert.equal(logisticsItemIncludesPerson(item, 'XAVIER DIAZ'), true)
  assert.equal(logisticsItemIncludesPerson(item, 'Una Altra Persona'), false)
})

test('les opcions de personal no dupliquen noms equivalents', () => {
  assert.deepEqual(
    getLogisticsPersonnelNames({
      workers: ['Julián Ramón'],
      vehicles: [{ conductor: 'Julian Ramon' }, { conductor: 'Xavier Diaz' }],
    }),
    ['Julián Ramón', 'Xavier Diaz']
  )
})
