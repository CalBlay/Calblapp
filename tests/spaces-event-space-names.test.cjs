const test = require('node:test')
const assert = require('node:assert/strict')

const { eventSpaceNames } = require('../src/lib/spacesEventSpaceNames.ts')

test('una oportunitat verda nomes reserva la ubicacio final', () => {
  const data = {
    Ubicacio: 'Masia Torreblanca (CEU001007)',
    Ubicacions: [
      'Casa del Mar',
      'Masia Torreblanca',
      'Mirador de les Caves',
    ],
  }

  assert.deepEqual(eventSpaceNames(data, true), ['Masia Torreblanca'])
})

test('una oportunitat no confirmada conserva totes les ubicacions candidates', () => {
  const data = {
    Ubicacio: 'Casa del Mar',
    Ubicacions: ['Casa del Mar', 'Masia Torreblanca', 'Casa del Mar'],
  }

  assert.deepEqual(eventSpaceNames(data), ['Casa del Mar', 'Masia Torreblanca'])
})

test('un document verd antic sense Ubicacio utilitza nomes la primera candidata', () => {
  const data = {
    Finca_2: ['Casa del Mar (CEU0029)', 'Masia Torreblanca (CEU001007)'],
  }

  assert.deepEqual(eventSpaceNames(data, true), ['Casa del Mar'])
})
