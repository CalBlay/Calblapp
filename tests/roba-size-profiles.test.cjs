const test = require('node:test')
const assert = require('node:assert/strict')

const {
  defaultRobaSizeOptions,
  normalizeRobaSizeOptions,
  robaSizesForFamily,
} = require('../src/lib/roba-personal/sizeProfiles.ts')

test('normalitza talles, conserva ordre i elimina duplicats', () => {
  assert.deepEqual(
    normalizeRobaSizeOptions([' S ', 'M', 's', '', ' XL ']),
    ['S', 'M', 'XL']
  )
})

test('els formats predefinits tenen valors per defecte', () => {
  assert.deepEqual(robaSizesForFamily('letters', []), defaultRobaSizeOptions('letters'))
  assert.deepEqual(robaSizesForFamily('numeric', []), defaultRobaSizeOptions('numeric'))
})

test('sense talla i formats desconeguts no creen variants', () => {
  assert.deepEqual(robaSizesForFamily('none', ['S']), [])
  assert.deepEqual(robaSizesForFamily('invalid', ['S']), [])
})

test('una família personalitzada conserva les seves talles', () => {
  assert.deepEqual(robaSizesForFamily('custom', ['Única', 'Especial']), ['Única', 'Especial'])
})
