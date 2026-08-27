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

const { classifyStage } = require('../src/services/zoho/sync-normalization')

after(() => {
  Module._load = originalLoad
})

test('classifyStage routes calentet to taronja and payment/RQ to verd', () => {
  assert.equal(classifyStage('Calentet'), 'taronja')
  assert.equal(classifyStage('Prereserva calentet'), 'taronja')
  assert.equal(classifyStage('Pagament confirmat'), 'verd')
  assert.equal(classifyStage('Cerrada ganada'), 'verd')
  assert.equal(classifyStage('RQ enviada'), 'verd')
})

test('classifyStage maps proposal/pending stages to groc and drops unknown', () => {
  assert.equal(classifyStage('Pendent client'), 'groc')
  assert.equal(classifyStage('Prereserva'), 'groc')
  assert.equal(classifyStage('Proposta enviada'), 'groc')
  assert.equal(classifyStage('Propuesta'), 'groc')
  assert.equal(classifyStage('Pressupost enviat'), 'groc')
  assert.equal(classifyStage('Qualificació'), null)
  assert.equal(classifyStage(''), null)
})
