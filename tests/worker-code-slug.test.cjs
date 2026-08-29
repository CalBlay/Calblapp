const assert = require('node:assert/strict')
const { test } = require('node:test')

const { slugifyWorkerCodeBase } = require('../src/lib/roba-personal/workerCodeFormat')

test('slugifyWorkerCodeBase folds accents, lowercases, and collapses separators', () => {
  assert.equal(slugifyWorkerCodeBase('Oriol Puig'), 'oriol-puig')
  assert.equal(slugifyWorkerCodeBase('  Núria   Solà  '), 'nuria-sola')
  assert.equal(slugifyWorkerCodeBase('José María'), 'jose-maria')
  assert.equal(slugifyWorkerCodeBase('A---B__C'), 'a-b-c')
  assert.equal(slugifyWorkerCodeBase('-x-'), 'x')
  assert.equal(slugifyWorkerCodeBase('WP-12'), 'wp-12')
})

test('slugifyWorkerCodeBase returns empty for blank or punctuation-only names', () => {
  assert.equal(slugifyWorkerCodeBase(''), '')
  assert.equal(slugifyWorkerCodeBase('   '), '')
  assert.equal(slugifyWorkerCodeBase('---'), '')
  assert.equal(slugifyWorkerCodeBase(null), '')
})
