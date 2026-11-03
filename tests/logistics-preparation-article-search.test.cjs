const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const originalLoad = Module._load
Module._load = function loadForArticleSearchTest(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/firebaseAdmin') return { firestoreAdmin: {} }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  preparationArticleMatchesSearch,
} = require('../src/lib/logistics/preparationForm.server')
Module._load = originalLoad

const article = {
  articleCode: '0900020001',
  articleName: "VR ICONES D'ALBET I NOYA",
}

test('preparation article search matches partial codes', () => {
  assert.equal(preparationArticleMatchesSearch(article, '020001'), true)
})

test('preparation article search matches names ignoring case and accents', () => {
  assert.equal(preparationArticleMatchesSearch(article, 'icones'), true)
  assert.equal(preparationArticleMatchesSearch(
    { articleCode: '1', articleName: 'Màquina de cafè' },
    'CAFE'
  ), true)
})

test('preparation article search rejects unrelated text', () => {
  assert.equal(preparationArticleMatchesSearch(article, 'copa martini'), false)
})
