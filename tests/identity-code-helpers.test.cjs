const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { unitDocId } = require('../src/lib/eventComanda/units.server')
const { joinRecipientEmails } = require('../src/lib/roba-personal/purchaseRecipient')
const { slugifyServeiCodi } = require('../src/lib/serveis/utils')
const { resolveServeiDocId } = require('../src/lib/serveis/server')

after(() => {
  Module._load = originalLoad
})

test('unitDocId uppercases and strips non-alphanumeric characters', () => {
  assert.equal(unitDocId(' kg '), 'KG')
  assert.equal(unitDocId('un-1'), 'UN1')
  assert.equal(unitDocId('C.AIXA'), 'CAIXA')
  assert.equal(unitDocId(''), '')
  assert.equal(unitDocId('   '), '')
  assert.equal(unitDocId('abcdefghij'), 'ABCDEFGHIJ')
})

test('joinRecipientEmails skips empty addresses and dedupes', () => {
  assert.equal(joinRecipientEmails([]), '')
  assert.equal(
    joinRecipientEmails([
      { id: '1', name: 'Ada', email: 'ada@example.test', department: 'compres' },
      { id: '2', name: 'No mail', email: null, department: 'compres' },
      { id: '3', name: 'Ada again', email: 'ada@example.test', department: 'compres' },
      { id: '4', name: 'Bob', email: 'bob@example.test', department: 'compres' },
      { id: '5', name: 'Blank', email: '', department: 'compres' },
    ]),
    'ada@example.test, bob@example.test'
  )
})

test('slugifyServeiCodi folds accents and collapses separators', () => {
  assert.equal(slugifyServeiCodi('  Càtering Extra  '), 'catering-extra')
  assert.equal(slugifyServeiCodi('A---B'), 'a-b')
  assert.equal(slugifyServeiCodi('***'), '')
})

test('resolveServeiDocId prefers an explicit code over the name slug', () => {
  assert.equal(resolveServeiDocId({ nom: 'Càtering Extra', codi: 'CAT-01' }), 'CAT-01')
  assert.equal(resolveServeiDocId({ nom: 'Càtering Extra', codi: '  ' }), 'catering-extra')
  assert.equal(resolveServeiDocId({ nom: 'Càtering Extra' }), 'catering-extra')
})
