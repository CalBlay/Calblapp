const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const originalLoad = Module._load
Module._load = function loadForMissingArticlesTest(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/firebaseAdmin') return { firestoreAdmin: {} }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  cleanPreparationMissingArticles,
} = require('../src/lib/logistics/preparationForm.server')
Module._load = originalLoad

test('pending preparation articles never send undefined values to Firestore', () => {
  const [article] = cleanPreparationMissingArticles([{
    articleCode: '0900020001',
    articleName: "VR ICONES D'ALBET I NOYA",
    quantity: 5,
    reason: 'pendent',
    prepared: false,
  }])

  assert.deepEqual(article, {
    articleCode: '0900020001',
    articleName: "VR ICONES D'ALBET I NOYA",
    quantity: 5,
    reason: 'pendent',
    note: '',
    prepared: false,
  })
  assert.equal(Object.values(article).includes(undefined), false)
})
