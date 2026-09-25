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

const {
  classifyStage,
  resolveZohoEndTime,
} = require('../src/services/zoho/sync-normalization')

after(() => {
  Module._load = originalLoad
})

test('classifyStage routes calentet to taronja and payment/RQ to verd', () => {
  assert.equal(classifyStage('Calentet'), 'taronja')
  assert.equal(classifyStage('Prereserva'), 'taronja')
  assert.equal(classifyStage('Pre-reserva'), 'taronja')
  assert.equal(classifyStage('Prereserva calentet'), 'taronja')
  assert.equal(classifyStage('Pagament confirmat'), 'verd')
  assert.equal(classifyStage('Cerrada ganada'), 'verd')
  assert.equal(classifyStage('RQ enviada'), 'verd')
})

test('classifyStage maps proposal/pending stages to groc and drops unknown', () => {
  assert.equal(classifyStage('Pendent client'), 'groc')
  assert.equal(classifyStage('Proposta enviada'), 'groc')
  assert.equal(classifyStage('Propuesta'), 'groc')
  assert.equal(classifyStage('Pressupost'), 'groc')
  assert.equal(classifyStage('Pressupost enviat'), 'groc')
  assert.equal(classifyStage('Qualificació'), null)
  assert.equal(classifyStage(''), null)
})

test('resolveZohoEndTime prioritizes wedding end time and falls back to event end time', () => {
  const parseTime = (value) => {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
  }

  assert.equal(
    resolveZohoEndTime(
      { Hora_Fi_Boda: '01:30 h', Hora_Fi_Evento: '23:00' },
      parseTime
    ),
    '01:30'
  )
  assert.equal(
    resolveZohoEndTime(
      { Hora_Fi_Boda: '', Hora_Fi_Evento: '9:15' },
      parseTime
    ),
    '09:15'
  )
  assert.equal(resolveZohoEndTime({}, parseTime), null)
})
